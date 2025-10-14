export const LINE_TABLE_WIDTHS = {
  part: 'w-[26%]',
  seller: 'w-[16%]',
  status: 'w-[10%]',
  needed: 'w-[8%]',
  ordered: 'w-[8%]',
  received: 'w-[8%]',
  note: 'w-[18%]',
  actions: 'w-[6%]',
} as const;

export type LineTableWidthKey = keyof typeof LINE_TABLE_WIDTHS;
