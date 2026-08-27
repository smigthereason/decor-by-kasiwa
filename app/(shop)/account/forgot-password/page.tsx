import {
  redirect,
} from "next/navigation";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Account Access",
};

export default function ForgotPasswordPage() {
  redirect(
    "/account/login",
  );
}
