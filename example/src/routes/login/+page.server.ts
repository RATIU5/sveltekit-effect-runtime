import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  const next = url.searchParams.get("next") ?? "/";
  return {
    next: next.startsWith("/") ? next : "/",
  };
};
