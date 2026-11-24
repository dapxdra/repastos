import { MenuMas } from "@/components/nav";
import { PageHeader } from "@/components/ui";
import { SelectorTema } from "@/components/tema";

export const metadata = { title: "Más" };

export default async function Mas({ params }: PageProps<"/app/[slug]/mas">) {
  const { slug } = await params;
  return (
    <>
      <PageHeader titulo="Más" />
      <MenuMas slug={slug} />
      <section className="card card-pad mt-4">
        <h2 className="mb-2 text-sm font-semibold">Apariencia</h2>
        <SelectorTema />
      </section>
    </>
  );
}
