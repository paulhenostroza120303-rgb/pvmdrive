import { NextResponse } from "next/server";
import ImageKit from "imagekit";

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY!,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT!,
});

export async function GET() {
  try {
    console.log("DEBUG AUTH: Public Key Length:", process.env.IMAGEKIT_PUBLIC_KEY?.length);
    console.log("DEBUG AUTH: Private Key Length:", process.env.IMAGEKIT_PRIVATE_KEY?.length);
    console.log("DEBUG AUTH: Endpoint:", process.env.IMAGEKIT_URL_ENDPOINT);
    
    const authenticationParameters = imagekit.getAuthenticationParameters();
    return NextResponse.json(authenticationParameters);
  } catch (error) {
    console.error("ImageKit Auth Error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
