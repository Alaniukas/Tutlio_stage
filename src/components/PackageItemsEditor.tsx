import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { Plus, X } from 'lucide-react';

export type PackageEditorSubject = {
  id: string;
  name: string;
  price: number | null;
  color?: string | null;
};

export type PackageEditorItem = {
  subjectId: string;
  totalLessons: number;
  pricePerLesson: number;
};

interface Props {
  subjects: PackageEditorSubject[];
  /** Per-(student,subject) overrides; subject id -> price. */
  individualPricing?: Record<string, number>;
  items: PackageEditorItem[];
  onChange: (items: PackageEditorItem[]) => void;
  /** Compact mode for inline forms (CompanyStudents); default modal sizing otherwise. */
  compact?: boolean;
  disabled?: boolean;
}

const newItem = (subjectId: string, price: number): PackageEditorItem => ({
  subjectId,
  totalLessons: 5,
  pricePerLesson: price,
});

/**
 * Renders a dynamic list of (subject, lessons, price) rows. Each subject can
 * appear at most once; the "Add subject" button is disabled when all of the
 * tutor's subjects are already in the list.
 *
 * Used by both `SendPackageModal` and `CompanyStudents` inline package send UI.
 */
export default function PackageItemsEditor({
  subjects,
  individualPricing = {},
  items,
  onChange,
  compact = false,
  disabled = false,
}: Props) {
  const { t } = useTranslation();

  const subjectById = useMemo(() => {
    const m = new Map<string, PackageEditorSubject>();
    for (const s of subjects) m.set(s.id, s);
    return m;
  }, [subjects]);

  const usedSubjectIds = useMemo(() => new Set(items.map((it) => it.subjectId)), [items]);
  const canAddMore = items.length < subjects.length;

  const resolvedPrice = (subjectId: string): number => {
    if (individualPricing[subjectId] !== undefined) return Number(individualPricing[subjectId]);
    const subj = subjectById.get(subjectId);
    return Number(subj?.price ?? 0);
  };

  const updateItem = (index: number, patch: Partial<PackageEditorItem>) => {
    onChange(items.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };

  const addItem = () => {
    const firstAvailable = subjects.find((s) => !usedSubjectIds.has(s.id));
    if (!firstAvailable) return;
    onChange([...items, newItem(firstAvailable.id, resolvedPrice(firstAvailable.id))]);
  };

  const labelClass = compact ? 'text-[11px] text-violet-900' : 'text-xs text-gray-600';
  const inputClass = compact ? 'h-8 text-xs rounded-lg' : 'rounded-lg';
  const subjectColWidth = compact ? 'col-span-7' : 'col-span-12 sm:col-span-7';
  const qtyColWidth = compact ? 'col-span-2' : 'col-span-6 sm:col-span-2';
  const priceColWidth = compact ? 'col-span-2' : 'col-span-5 sm:col-span-2';
  const removeColWidth = compact ? 'col-span-1' : 'col-span-1';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {items.map((item, index) => {
        const subj = subjectById.get(item.subjectId);
        const otherUsed = new Set(items.filter((_, i) => i !== index).map((it) => it.subjectId));
        const itemTotal = item.totalLessons * item.pricePerLesson;
        return (
          <div
            key={`${item.subjectId}-${index}`}
            className={
              compact
                ? 'p-2 rounded-lg border border-violet-200 bg-white/60'
                : 'p-3 rounded-xl border border-gray-200 bg-white'
            }
          >
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className={subjectColWidth + ' space-y-1'}>
                {index === 0 && (
                  <Label className={labelClass}>{t('package.itemSubject')}</Label>
                )}
                <Select
                  value={item.subjectId}
                  onValueChange={(v) => {
                    if (otherUsed.has(v)) return; // ignore duplicate selection
                    updateItem(index, { subjectId: v, pricePerLesson: resolvedPrice(v) });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder={t('package.selectSubject')}>
                      {subj ? (
                        <div className="flex items-center gap-2 min-w-0">
                          {subj.color && (
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subj.color }} />
                          )}
                          <span className="truncate">{subj.name}</span>
                        </div>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id} disabled={otherUsed.has(s.id)}>
                        <div className="flex items-center gap-2 min-w-0">
                          {s.color && (
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          )}
                          <span className="truncate">{s.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={qtyColWidth + ' space-y-1'}>
                {index === 0 && (
                  <Label className={labelClass}>{t('package.itemLessons')}</Label>
                )}
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={item.totalLessons}
                  onChange={(e) =>
                    updateItem(index, { totalLessons: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  className={inputClass}
                  disabled={disabled}
                />
              </div>
              <div className={priceColWidth + ' space-y-1'}>
                {index === 0 && (
                  <Label className={labelClass}>{t('package.itemPrice')}</Label>
                )}
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.pricePerLesson}
                  onChange={(e) =>
                    updateItem(index, { pricePerLesson: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  className={inputClass}
                  disabled={disabled}
                />
              </div>
              <div className={removeColWidth + ' flex justify-end'}>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={disabled || items.length === 1}
                  title={t('package.removeSubject')}
                  className={`inline-flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 ${
                    compact ? 'h-8 w-8' : 'h-9 w-9'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <X className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                </button>
              </div>
            </div>
            <div className={compact ? 'mt-1 text-[11px] text-violet-600' : 'mt-2 text-xs text-gray-500'}>
              {item.totalLessons} × {item.pricePerLesson.toFixed(2)} € ={' '}
              <span className="font-semibold text-gray-700">{itemTotal.toFixed(2)} €</span>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size={compact ? 'sm' : 'default'}
        onClick={addItem}
        disabled={disabled || !canAddMore}
        className={
          compact
            ? 'h-8 text-xs rounded-lg border-dashed border-violet-300 text-violet-700 hover:bg-violet-50'
            : 'rounded-lg border-dashed text-violet-700 hover:bg-violet-50'
        }
      >
        <Plus className={compact ? 'w-3.5 h-3.5 mr-1' : 'w-4 h-4 mr-1.5'} />
        {t('package.addSubject')}
      </Button>
    </div>
  );
}
