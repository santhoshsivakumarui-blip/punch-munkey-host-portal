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
  const validLocation = { venueName: 'Terrace Rooftop', area: 'HSR Layout', addressLine: '412, 9th Main', gateCode: '', revealHoursBefore: 4, radiusKm: 2.4 };

  it('accepts a fully-filled valid form', async () => {
    await expect(locationSchema.validate(validLocation)).resolves.toBeTruthy();
  });

  it('rejects a reveal window outside 1-24 hours', async () => {
    await expect(locationSchema.validate({ ...validLocation, revealHoursBefore: 0 })).rejects.toThrow();
    await expect(locationSchema.validate({ ...validLocation, revealHoursBefore: 25 })).rejects.toThrow();
  });

  it('rejects a radius outside 1-5 km', async () => {
    await expect(locationSchema.validate({ ...validLocation, radiusKm: 0.5 })).rejects.toThrow();
    await expect(locationSchema.validate({ ...validLocation, radiusKm: 6 })).rejects.toThrow();
  });
});

describe('staffSchema', () => {
  it('requires both fields non-blank', async () => {
    await expect(staffSchema.validate({ doorStaff: 'Rahul', ratioRule: '2 couples : 1 stag' })).resolves.toBeTruthy();
    await expect(staffSchema.validate({ doorStaff: '', ratioRule: '2 couples : 1 stag' })).rejects.toThrow();
    await expect(staffSchema.validate({ doorStaff: 'Rahul', ratioRule: '' })).rejects.toThrow();
  });
});
