import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassGroupCancelScopeFields } from '@/components/ClassGroupCancelScopeFields';
import { StaticLocaleProvider } from '@/contexts/LocaleContext';
import { useState } from 'react';
import { lt } from '@/lib/i18n/lt';

const students = [
  { student_id: 'lukrecija', name: 'Lukrecija' },
  { student_id: 'tauras', name: 'Tauras' },
];

function Harness() {
  const [scope, setScope] = useState<'one_student' | 'whole_occurrence'>('whole_occurrence');
  const [studentId, setStudentId] = useState('lukrecija');
  return (
    <StaticLocaleProvider locale="lt">
      <div className="w-[min(96vw,24rem)] max-w-[24rem] min-w-0 overflow-x-hidden">
        <ClassGroupCancelScopeFields
          radioName="testClassGroupCancel"
          scope={scope}
          onScopeChange={setScope}
          studentId={studentId}
          onStudentIdChange={setStudentId}
          students={students}
        />
      </div>
    </StaticLocaleProvider>
  );
}

describe('ClassGroupCancelScopeFields', () => {
  it('defaults to whole group and keeps copy short enough for a lesson modal', () => {
    expect(lt['cal.cancelClassGroupChoiceDesc'].length).toBeLessThan(40);
    expect(lt['cal.cancelWholeGroupDesc'].length).toBeLessThan(80);
    render(<Harness />);
    expect(screen.getByText(lt['cal.cancelWholeGroup'])).toBeTruthy();
    expect(screen.queryByLabelText(lt['cal.cancelPickStudent'])).toBeNull();
  });

  it('shows the student picker only after choosing one student', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText(lt['cal.cancelOneStudent']));
    const select = screen.getByLabelText(lt['cal.cancelPickStudent']) as HTMLSelectElement;
    expect(select.value).toBe('lukrecija');
    fireEvent.change(select, { target: { value: 'tauras' } });
    expect(select.value).toBe('tauras');
  });
});
