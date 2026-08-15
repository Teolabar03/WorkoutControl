import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dataIt } from "@/lib/format"
import type { PR } from "@/api/statistiche"

export function PrTable({ titolo, record }: { titolo: string; record: PR[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 font-heading text-lg font-semibold">{titolo}</h2>
      {record.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ancora nessun record.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Esercizio</TableHead>
                <TableHead>Record</TableHead>
                <TableHead className="text-right">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {record.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.esercizio}</TableCell>
                  <TableCell className="text-accent">{p.etichetta}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {dataIt(p.data)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
