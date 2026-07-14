import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimeSpinner from '@/components/TimeSpinner';

describe('TimeSpinner wheel control', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accumulates small trackpad deltas before changing time', () => {
    const onChange = vi.fn();
    render(<TimeSpinner value="08:00" onChange={onChange} />);

    const [hours] = screen.getAllByTitle('Dvigubas paspaudimas – įvesti rankiniu būdu');

    fireEvent.wheel(hours, { deltaY: 20 });
    fireEvent.wheel(hours, { deltaY: 20 });
    fireEvent.wheel(hours, { deltaY: 20 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.wheel(hours, { deltaY: 20 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('09:00');
  });

  it('rate-limits rapid wheel events to one controlled step', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TimeSpinner value="08:00" onChange={onChange} />);

    const [hours] = screen.getAllByTitle('Dvigubas paspaudimas – įvesti rankiniu būdu');

    fireEvent.wheel(hours, { deltaY: 100 });
    fireEvent.wheel(hours, { deltaY: 100 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('09:00');

    act(() => vi.advanceTimersByTime(120));
    fireEvent.wheel(hours, { deltaY: 100 });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('10:00');
  });
});
