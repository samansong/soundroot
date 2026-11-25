import { AuthForm } from "./AuthForm";

export const metadata = { title: "Join SoundzRoot" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="page auth-wrap"><AuthForm mode="signup" next={next} /></div>;
}
