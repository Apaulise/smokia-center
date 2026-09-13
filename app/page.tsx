import { redirect } from "next/navigation";

export default function RootPage() {
  // El middleware manda a /login si no hay sesión.
  redirect("/leads");
}
