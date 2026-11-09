import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiBaseBootstrap } from './ApiBaseBootstrap';
import { API_BASE_STORAGE_KEY, getApiBase, setApiBase } from '@/lib/api/base';

describe('ApiBaseBootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    setApiBase(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('reads the stored base on mount', () => {
    localStorage.setItem(API_BASE_STORAGE_KEY, 'https://apidot.example.com/');

    render(<ApiBaseBootstrap />);

    expect(getApiBase()).toBe('https://apidot.example.com');
  });

  it('leaves the base empty without a stored value', () => {
    render(<ApiBaseBootstrap />);

    expect(getApiBase()).toBe('');
  });
});
