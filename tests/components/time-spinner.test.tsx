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

    fireEvent.wheel(hours, { deltaY: 14 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.wheel(hours, { deltaY: 14 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('09:00');
  });

  it('rate-limits rapid wheel events to one step per tick', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TimeSpinner value="08:00" onChange={onChange} />);

    const [hours] = screen.getAllByTitle('Dvigubas paspaudimas – įvesti rankiniu būdu');

    fireEvent.wheel(hours, { deltaY: 28 });
    fireEvent.wheel(hours, { deltaY: 28 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('09:00');

    act(() => vi.advanceTimersByTime(25));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('10:00');
  });

  it('drains a large wheel flick one step at a time', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TimeSpinner value="08:00" onChange={onChange} />);

    const [hours] = screen.getAllByTitle('Dvigubas paspaudimas – įvesti rankiniu būdu');

    fireEvent.wheel(hours, { deltaY: 140 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('09:00');

    act(() => vi.advanceTimersByTime(100));
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange).toHaveBeenLastCalledWith('13:00');
  });
});
