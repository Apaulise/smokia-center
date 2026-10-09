import { LoginScreen } from "./login-screen";

export const metadata = { title: "Ingresar · Awareness AI" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error =
    params.error === undefined ? null : params.error === "not_allowed" ? "not_allowed" : "failed";

  return <LoginScreen next={next} error={error} />;
}
