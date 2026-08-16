import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  readonly currentTheme = signal<Theme>('dark');

  constructor() {
    const saved = localStorage.getItem('sbe_theme') as Theme | null;
    const initialTheme: Theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    this.setTheme(initialTheme);
  }

  toggleTheme(): void {
    const newTheme: Theme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  setTheme(theme: Theme): void {
    this.currentTheme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sbe_theme', theme);
  }
}
