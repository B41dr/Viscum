import { Chat } from "@/components/chat";

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        backgroundColor: "#fafafa",
      }}
    >
      <main style={{ flex: 1, width: "100%" }}>
        <Chat />
      </main>
    </div>
  );
}
