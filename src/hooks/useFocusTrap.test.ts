import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function createContainer(...elements: HTMLElement[]): HTMLDivElement {
  const container = document.createElement('div');
  elements.forEach((el) => container.appendChild(el));
  document.body.appendChild(container);
  return container;
}

function createButton(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  return btn;
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses first focusable element when activated', () => {
    const btn1 = createButton('First');
    const btn2 = createButton('Second');
    const container = createContainer(btn1, btn2);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    expect(document.activeElement).toBe(btn1);
  });

  it('does not focus anything when not active', () => {
    const btn = createButton('Button');
    const container = createContainer(btn);
    const ref = { current: container };
    const previousFocus = document.activeElement;

    renderHook(() => useFocusTrap(ref, false));

    expect(document.activeElement).toBe(previousFocus);
  });

  it('wraps Tab from last to first element', () => {
    const btn1 = createButton('First');
    const btn2 = createButton('Second');
    const container = createContainer(btn1, btn2);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    // Focus last element
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    // Tab from last should wrap to first
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(btn1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('wraps Shift+Tab from first to last element', () => {
    const btn1 = createButton('First');
    const btn2 = createButton('Second');
    const container = createContainer(btn1, btn2);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    // Focus is on btn1 (first). Shift+Tab should wrap to btn2 (last).
    expect(document.activeElement).toBe(btn1);
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(document.activeElement).toBe(btn2);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent Tab when not wrapping', () => {
    const btn1 = createButton('First');
    const btn2 = createButton('Second');
    const container = createContainer(btn1, btn2);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    // Focus is on btn1 (first, not last) — regular Tab should not be prevented
    expect(document.activeElement).toBe(btn1);
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    // Should NOT prevent default (browser handles normal tab)
    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents Tab with no focusable elements', () => {
    const div = document.createElement('div');
    div.textContent = 'No buttons';
    const container = createContainer(div);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('calls onEscape callback on Escape key', () => {
    const onEscape = vi.fn();
    const btn = createButton('Button');
    const container = createContainer(btn);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true, onEscape));

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores non-Tab non-Escape keys', () => {
    const btn = createButton('Button');
    const container = createContainer(btn);
    const ref = { current: container };

    renderHook(() => useFocusTrap(ref, true));

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('restores focus to previous element on deactivate', () => {
    const outsideBtn = document.createElement('button');
    outsideBtn.textContent = 'Outside';
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();

    const innerBtn = createButton('Inside');
    const container = createContainer(innerBtn);
    const ref = { current: container };

    const { rerender } = renderHook(({ active }) => useFocusTrap(ref, active), {
      initialProps: { active: true },
    });

    expect(document.activeElement).toBe(innerBtn);

    rerender({ active: false });

    expect(document.activeElement).toBe(outsideBtn);
  });

  it('handles container with no focusable elements gracefully', () => {
    const div = document.createElement('div');
    div.textContent = 'No focusable elements here';
    const container = createContainer(div);
    const ref = { current: container };

    // Should not throw
    expect(() => {
      renderHook(() => useFocusTrap(ref, true));
    }).not.toThrow();
  });

  it('does nothing when ref is null', () => {
    const ref = { current: null };

    expect(() => {
      renderHook(() => useFocusTrap(ref, true));
    }).not.toThrow();
  });
});
