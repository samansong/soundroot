import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page auth-wrap">
      <div className="stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <div className="eyebrow">404</div>
        <h1>This track skipped.</h1>
        <p className="text-2">The page you're looking for doesn't exist — or you don't have access to it.</p>
        <Link href="/" className="btn btn-primary">Back home</Link>
      </div>
    </div>
  );
}
