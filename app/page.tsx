import Link from "next/link";
import system from "@/lib/system_v1.json";

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        Bridge Bidding Trainer
      </h1>

      <p style={{ marginTop: 20 }}>
        Loaded system:
        <strong> {system.meta.name}</strong>
      </p>

      <p>
        Version:
        <strong> {system.meta.version}</strong>
      </p>

      <p>
        Default scoring:
        <strong> {system.meta.scoring_default}</strong>
      </p>

      <p style={{ marginTop: 24 }}>
        <Link
          href="/practice/v3"
          style={{ fontWeight: 700, color: "#14493A", textDecoration: "underline" }}
        >
          Go to the Auction Trainer &rarr;
        </Link>
      </p>
    </main>
  );
}
