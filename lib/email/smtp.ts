import "server-only";

import net from "node:net";
import tls from "node:tls";

type MailInput = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  defaultFrom: string;
  defaultReplyTo?: string;
};

type PendingLine = {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
};

class LineReader {
  private buffer = "";
  private lines: string[] = [];
  private pending: PendingLine[] = [];
  private failure: Error | null = null;

  private readonly onData = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();
    let marker = this.buffer.indexOf("\r\n");
    while (marker >= 0) {
      this.lines.push(this.buffer.slice(0, marker));
      this.buffer = this.buffer.slice(marker + 2);
      marker = this.buffer.indexOf("\r\n");
    }
    this.flush();
  };

  private readonly onError = (cause: Error) => {
    this.fail(cause);
  };

  private readonly onClose = () => {
    this.fail(new Error("SMTP connection closed unexpectedly."));
  };

  constructor(private readonly socket: net.Socket | tls.TLSSocket) {
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  dispose() {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
  }

  nextLine() {
    if (this.lines.length > 0) return Promise.resolve(this.lines.shift() as string);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<string>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  private flush() {
    while (this.pending.length > 0 && this.lines.length > 0) {
      const waiter = this.pending.shift() as PendingLine;
      waiter.resolve(this.lines.shift() as string);
    }
  }

  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    while (this.pending.length > 0) {
      this.pending.shift()?.reject(error);
    }
  }
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = readBoolean(process.env.SMTP_SECURE, port === 465);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim();
  const defaultFrom = process.env.SMTP_FROM?.trim() || user;
  const defaultReplyTo = process.env.EMAIL_REPLY_TO?.trim() || process.env.ORDER_EMAIL_REPLY_TO?.trim();

  if (!host) throw new Error("SMTP_HOST is missing.");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("SMTP_PORT is invalid.");
  if (!user) throw new Error("SMTP_USER is missing.");
  if (!password) throw new Error("SMTP_PASSWORD is missing.");
  if (!defaultFrom) throw new Error("SMTP_FROM or SMTP_USER is missing.");

  return { host, port, secure, user, password, defaultFrom, defaultReplyTo };
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function extractAddress(value: string) {
  const bracketed = value.match(/<([^<>]+)>/);
  return (bracketed?.[1] || value).trim();
}

function normalizeRecipients(value: string | string[]) {
  const recipients = (Array.isArray(value) ? value : [value])
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error("At least one email recipient is required.");
  return recipients;
}

function encodeSubject(subject: string) {
  const clean = sanitizeHeader(subject);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function prepareData(input: {
  from: string;
  recipients: string[];
  replyTo?: string;
  subject: string;
  html: string;
}) {
  const headers = [
    `From: ${sanitizeHeader(input.from)}`,
    `To: ${input.recipients.map(sanitizeHeader).join(", ")}`,
    ...(input.replyTo ? [`Reply-To: ${sanitizeHeader(input.replyTo)}`] : []),
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    `Date: ${new Date().toUTCString()}`,
  ];

  const body = input.html.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}

async function waitForConnection(socket: net.Socket | tls.TLSSocket, event: "connect" | "secureConnect") {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP connection timed out."));
    }, 15_000);

    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (cause: Error) => {
      cleanup();
      reject(cause);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(event, onReady);
      socket.off("error", onError);
    };

    socket.once(event, onReady);
    socket.once("error", onError);
  });
}

async function readResponse(reader: LineReader) {
  const lines: string[] = [];
  const first = await reader.nextLine();
  lines.push(first);
  const match = first.match(/^(\d{3})([ -])/);
  if (!match) throw new Error(`Unexpected SMTP response: ${first}`);

  const code = Number(match[1]);
  if (match[2] === "-") {
    while (true) {
      const line = await reader.nextLine();
      lines.push(line);
      if (line.startsWith(`${match[1]} `)) break;
    }
  }
  return { code, message: lines.join("\n") };
}

async function sendCommand(
  socket: net.Socket | tls.TLSSocket,
  reader: LineReader,
  command: string,
  acceptedCodes: number[],
) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(reader);
  if (!acceptedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${response.code}): ${response.message}`);
  }
  return response;
}

async function openConnection(config: SmtpConfig) {
  if (config.secure) {
    const socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: true,
    });
    socket.setTimeout(20_000, () => socket.destroy(new Error("SMTP connection timed out.")));
    await waitForConnection(socket, "secureConnect");
    return { socket, reader: new LineReader(socket) };
  }

  const plainSocket = net.connect({ host: config.host, port: config.port });
  plainSocket.setTimeout(20_000, () => plainSocket.destroy(new Error("SMTP connection timed out.")));
  await waitForConnection(plainSocket, "connect");
  let reader = new LineReader(plainSocket);

  const greeting = await readResponse(reader);
  if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.message}`);
  const ehlo = await sendCommand(plainSocket, reader, `EHLO ${process.env.SMTP_HELO_NAME?.trim() || "decorbykasiwa.co.ke"}`, [250]);
  if (!/STARTTLS/i.test(ehlo.message)) {
    reader.dispose();
    plainSocket.destroy();
    throw new Error("SMTP server does not advertise STARTTLS. Use secure SMTP (usually port 465) or enable STARTTLS.");
  }
  await sendCommand(plainSocket, reader, "STARTTLS", [220]);
  reader.dispose();

  const secureSocket = tls.connect({ socket: plainSocket, servername: config.host, rejectUnauthorized: true });
  await waitForConnection(secureSocket, "secureConnect");
  reader = new LineReader(secureSocket);
  return { socket: secureSocket, reader, greetingAlreadyRead: true };
}

export async function sendSmtpEmail(input: MailInput) {
  const config = getSmtpConfig();
  const recipients = normalizeRecipients(input.to);
  const from = input.from?.trim() || config.defaultFrom;
  const replyTo = input.replyTo?.trim() || config.defaultReplyTo;
  const envelopeFrom = extractAddress(from);
  const connection = await openConnection(config);
  const { socket, reader } = connection;

  try {
    if (!("greetingAlreadyRead" in connection)) {
      const greeting = await readResponse(reader);
      if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.message}`);
    }

    await sendCommand(socket, reader, `EHLO ${process.env.SMTP_HELO_NAME?.trim() || "decorbykasiwa.co.ke"}`, [250]);
    await sendCommand(socket, reader, "AUTH LOGIN", [334]);
    await sendCommand(socket, reader, Buffer.from(config.user).toString("base64"), [334]);
    await sendCommand(socket, reader, Buffer.from(config.password).toString("base64"), [235]);
    await sendCommand(socket, reader, `MAIL FROM:<${envelopeFrom}>`, [250]);
    for (const recipient of recipients) {
      await sendCommand(socket, reader, `RCPT TO:<${extractAddress(recipient)}>`, [250, 251]);
    }
    await sendCommand(socket, reader, "DATA", [354]);

    const data = prepareData({ from, recipients, replyTo, subject: input.subject, html: input.html });
    socket.write(`${data}.\r\n`);
    const queued = await readResponse(reader);
    if (queued.code !== 250) throw new Error(`SMTP server rejected the message: ${queued.message}`);

    await sendCommand(socket, reader, "QUIT", [221]).catch(() => undefined);
  } finally {
    reader.dispose();
    socket.end();
  }
}
