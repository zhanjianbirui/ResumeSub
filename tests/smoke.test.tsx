// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';

afterEach(cleanup);

it('renders preact JSX in happy-dom', () => {
  render(<p>ok</p>);
  expect(screen.getByText('ok')).toBeTruthy();
});
