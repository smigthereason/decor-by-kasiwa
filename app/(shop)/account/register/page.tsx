import {
  redirect,
} from "next/navigation";
import type { Metadata } from 'next';


export const metadata: Metadata = {
  title: "Create Account",
};

export default function RegisterPage() {
  redirect(
    "/account/login",
  );
}
