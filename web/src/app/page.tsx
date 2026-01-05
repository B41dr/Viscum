import { Chat } from "@/components/chat";

export default function Home() {
  return (
    <div className="flex min-h-screen bg-background">
      <main className="flex-1">
        <Chat />
      </main>
    </div>
  );
}
