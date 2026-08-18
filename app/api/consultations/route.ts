import { NextResponse } from "next/server";
import { writeClient } from "@/sanity/lib/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body?.name || !body?.email) {
      return NextResponse.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    if (
      !process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
      !process.env.SANITY_API_WRITE_TOKEN
    ) {
      return NextResponse.json(
        {
          error:
            "Sanity is not configured. Add NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_WRITE_TOKEN.",
        },
        { status: 503 }
      );
    }

    const document = await writeClient.create({
      _type: "consultation",
      ...body,
      status: "new",
      submittedAt: new Date().toISOString(),
    });

    return NextResponse.json({ id: document._id }, { status: 201 });
  } catch (error) {
    console.error("Consultation submission failed:", error);
    return NextResponse.json(
      { error: "Could not submit consultation." },
      { status: 500 }
    );
  }
}
