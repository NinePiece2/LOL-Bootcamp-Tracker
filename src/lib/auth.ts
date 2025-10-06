import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { prisma } from './db';
import { z } from 'zod';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    isAdmin: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/', // We'll handle sign-in via dialog on home page
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        identifier: { label: 'Email or Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ 
            identifier: z.string().min(1), 
            password: z.string().min(6) 
          })
          .safeParse(credentials);

        if (!parsedCredentials.success) return null;

        const { identifier, password } = parsedCredentials.data;

        // Try to find user by email or username (case-insensitive for username)
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { 
                username: {
                  equals: identifier,
                  mode: 'insensitive'
                }
              },
            ],
          },
        });

        if (!user) return null;

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
  },
});
