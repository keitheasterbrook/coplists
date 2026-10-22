import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('SETUP-01 HomePage', () => {
  it('shows the placeholder page', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Coplist' })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
