import { describe, expect, it } from 'vitest';
import { basicsSchema, locationSchema, staffSchema, EVENT_TYPE_DEFAULTS } from './wizard';

const validBasics = {
  eventType: 'private' as const,
  title: 'House Set',
  dateISO: '2026-09-12',
  startTime: '21:00',
  endTime: '02:00',
  description: 'Sundowner to late',
  priceRupees: 1899,
  capacity: 60,
  coverImageUrl: '',
};

describe('basicsSchema', () => {
  it('accepts a fully-filled valid form', async () => {
    await expect(basicsSchema.validate(validBasics)).resolves.toBeTruthy();
  });

  it('rejects a blank title', async () => {
    await expect(basicsSchema.validate({ ...validBasics, title: '  ' })).rejects.toThrow();
  });

  it('rejects a zero or negative price', async () => {
    await expect(basicsSchema.validate({ ...validBasics, priceRupees: 0 })).rejects.toThrow();
    await expect(basicsSchema.validate({ ...validBasics, priceRupees: -100 })).rejects.toThrow();
  });

  it('rejects a non-integer capacity', async () => {
    await expect(basicsSchema.validate({ ...validBasics, capacity: 12.5 })).rejects.toThrow();
  });

  it('rejects an eventType outside the three known cards', async () => {
    await expect(basicsSchema.validate({ ...validBasics, eventType: 'festival' as never })).rejects.toThrow();
  });
});

describe('EVENT_TYPE_DEFAULTS', () => {
  it('only "club" sets requiresApproval false — private and couples both require approval', () => {
    expect(EVENT_TYPE_DEFAULTS.private.requiresApproval).toBe(true);
    expect(EVENT_TYPE_DEFAULTS.couples.requiresApproval).toBe(true);
    expect(EVENT_TYPE_DEFAULTS.club.requiresApproval).toBe(false);
  });

  it('club has no conduct-floor minRating; private/couples do', () => {
    expect(EVENT_TYPE_DEFAULTS.club.minRating).toBeNull();
    expect(EVENT_TYPE_DEFAULTS.private.minRating).not.toBeNull();
    expect(EVENT_TYPE_DEFAULTS.couples.minRating).not.toBeNull();
  });
});

describe('locationSchema', () => {
  const validLocation = { venueName: 'Terrace Rooftop', area: 'HSR Layout', addressLine: '412, 9th Main', gateCode: '' };

  it('accepts a fully-filled valid form', async () => {
    await expect(locationSchema.validate(validLocation)).resolves.toBeTruthy();
  });

  it('requires the exact address, since guests need it at the reveal', async () => {
    await expect(locationSchema.validate({ ...validLocation, addressLine: '' })).rejects.toThrow(/exact door/);
  });
});

describe('staffSchema', () => {
  it('accepts named staff with at least one person on the door', async () => {
    await expect(staffSchema.validate({ members: [{ name: 'Rahul', role: 'door' }], minWomenPercent: 50 })).resolves.toBeTruthy();
    await expect(staffSchema.validate({ members: [{ name: 'Rahul', role: 'door' }, { name: 'Asha', role: 'bar' }], minWomenPercent: 0 })).resolves.toBeTruthy();
  });

  it('rejects blank names, no staff, or nobody on the door', async () => {
    await expect(staffSchema.validate({ members: [{ name: '', role: 'door' }], minWomenPercent: 0 })).rejects.toThrow();
    await expect(staffSchema.validate({ members: [], minWomenPercent: 0 })).rejects.toThrow();
    await expect(staffSchema.validate({ members: [{ name: 'Asha', role: 'bar' }], minWomenPercent: 0 })).rejects.toThrow(/door/);
  });

  it('keeps the ratio within 0-100%', async () => {
    await expect(staffSchema.validate({ members: [{ name: 'Rahul', role: 'door' }], minWomenPercent: 120 })).rejects.toThrow();
  });
});
