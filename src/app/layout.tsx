import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = {
  title: "PVM Drive",
  description: "Tu almacenamiento en la nube",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
