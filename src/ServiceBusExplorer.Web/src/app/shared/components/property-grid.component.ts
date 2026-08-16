import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-property-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="property-grid-container">
      <table class="prop-table">
        <thead>
          <tr>
            <th style="width: 35%">Property</th>
            <th style="width: 20%">Type</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          @for (item of items; track item.key) {
            <tr>
              <td class="prop-key">{{ item.key }}</td>
              <td class="prop-type"><span class="badge badge-purple">{{ item.type }}</span></td>
              <td class="prop-value" (click)="copyValue(item.value)" [title]="'Click to copy: ' + item.value">
                {{ item.value }}
              </td>
            </tr>
          }
          @if (!items || items.length === 0) {
            <tr>
              <td colspan="3" class="empty-row">No properties available</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .property-grid-container {
      background: var(--bg-code);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: auto;
      max-height: 100%;
    }
    .prop-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      font-family: var(--font-mono);
    }
    th {
      background: var(--bg-toolbar);
      color: var(--text-muted);
      text-align: left;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--table-border-row);
      color: var(--text-main);
      word-break: break-all;
    }
    tr:hover td {
      background: var(--table-row-hover);
    }
    .prop-key {
      color: var(--accent-primary);
    }
    .prop-type {
      color: var(--text-dim);
    }
    .prop-value {
      cursor: pointer;
      user-select: text;
    }
    .empty-row {
      text-align: center;
      color: var(--text-dim);
      padding: 20px;
    }
  `]
})
export class PropertyGridComponent {
  @Input() items: { key: string; value: any; type: string }[] = [];

  copyValue(val: any) {
    if (val !== undefined && val !== null) {
      navigator.clipboard.writeText(String(val));
    }
  }
}
