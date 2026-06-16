import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

type CookieMutation = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function createMiddlewareSupabaseClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieMutation[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return {
    supabase,
    getResponse() {
      return response;
    },
  };
}

export async function createRouteHandlerSupabaseClient() {
  const cookieStore = await cookies();
  const cookieMutations: SupabaseCookie[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieMutation[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieMutations.push({ name, value, options });
          });
        },
      },
    }
  );

  return { supabase, cookieMutations };
}

export function applySupabaseCookies(
  response: NextResponse,
  cookieMutations: Array<{ name: string; value: string; options: CookieOptions }>
) {
  cookieMutations.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export function copySupabaseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie: ReturnType<NextResponse['cookies']['getAll']>[number]) => {
    target.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path,
      maxAge: cookie.maxAge,
      expires: cookie.expires,
    });
  });

  return target;
}
