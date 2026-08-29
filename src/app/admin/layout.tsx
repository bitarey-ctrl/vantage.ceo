export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div style={{ minHeight: "100vh", background: "#0a0a0a" }}>{children}</div>;
}
