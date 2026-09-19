import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

export interface PanelProps {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}

/**
 * A titled card: the shape every screen of this product has.
 *
 * It exists so a screen states its title, its explanation and its content, and nothing about the
 * five primitives that arrange them. The primitives are generated territory — the next
 * regeneration of `components/ui/` should not be a change to every feature.
 */
export function Panel({ title, description, children }: PanelProps): React.JSX.Element {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
