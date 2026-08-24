import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    /* ============================================================ */
    /* VALIDATION                                                   */
    /* ============================================================ */

    if (!body?.name || !body?.email) {
      return NextResponse.json(
        {
          error: "Name and email are required.",
        },
        {
          status: 400,
        }
      );
    }

    /* ============================================================ */
    /* SANITY CONFIGURATION CHECK                                   */
    /*                                                              */
    /* Sanity is not configured yet, so we deliberately check       */
    /* before importing the Sanity client.                          */
    /* ============================================================ */

    const projectId =
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;

    const writeToken =
      process.env.SANITY_API_WRITE_TOKEN;

    if (!projectId || !writeToken) {
      return NextResponse.json(
        {
          error:
            "Consultation submissions are not connected yet. Please try again once the enquiry service has been configured.",
          configured: false,
        },
        {
          status: 503,
        }
      );
    }

    /* ============================================================ */
    /* LOAD SANITY ONLY WHEN IT IS ACTUALLY CONFIGURED               */
    /* ============================================================ */

    const { writeClient } = await import(
      "@/sanity/lib/client"
    );

    /* ============================================================ */
    /* CREATE CONSULTATION                                          */
    /* ============================================================ */

    const document =
      await writeClient.create({
        _type: "consultation",

        ...body,

        status: "new",

        submittedAt:
          new Date().toISOString(),
      });

    /* ============================================================ */
    /* SUCCESS                                                      */
    /* ============================================================ */

    return NextResponse.json(
      {
        id: document._id,
        success: true,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Consultation submission failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Could not submit consultation.",
      },
      {
        status: 500,
      }
    );
  }
}
