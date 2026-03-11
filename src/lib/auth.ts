// NOTE: Using next-auth@5.0.0-beta.30 (Auth.js v5)
// Monitor https://github.com/nextauthjs/next-auth/releases for stable v5 release
// Current config is compatible with the stable API — upgrade when available
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const isSelfHosted =
  !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET;

const providers = [];

// Google OAuth — only if credentials are configured
if (!isSelfHosted) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  );
}

// Credentials — local/self-hosted login
providers.push(
  Credentials({
    name: "Local Login",
    credentials: {
      email: { label: "Email", type: "email" },
      name: { label: "Nome", type: "text" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string | undefined;
      if (!email) return null;

      const name = (credentials?.name as string) || email.split("@")[0];

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name,
            role: "ADMIN",
            emailVerified: new Date(),
            onboarded: false,
          },
        });
      }

      return { id: user.id, email: user.email, name: user.name };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
        token.plan = (user as { plan?: string }).plan ?? "free";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.plan = token.plan as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});
