import { AuthForm } from "../signup/AuthForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="page auth-wrap"><AuthForm mode="login" next={next} /></div>;
}
