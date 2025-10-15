export const LINE_TABLE_WIDTHS = {
  part: 'w-[30%]',
  seller: 'w-[10%]',
  status: 'w-[10%]',
  needed: 'w-[10%]',
  ordered: 'w-[10%]',
  received: 'w-[10%]',
  note: 'w-[20%]',
  actions: 'min-w-[200px]',
} as const;

export type LineTableWidthKey = keyof typeof LINE_TABLE_WIDTHS;
