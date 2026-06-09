import { auth } from "./firebase-admin";

export interface AuthUser {
  uid: string;
  email: string;
}

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email || "" };
  } catch {
    return null;
  }
}
