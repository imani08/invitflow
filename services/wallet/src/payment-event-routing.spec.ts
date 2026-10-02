import assert from 'node:assert/strict';
import test from 'node:test';
import { walletPaymentCommand } from './payment-event-routing.js';

const base = { paymentId: '11111111-1111-4111-8111-111111111111', orderId: '22222222-2222-4222-8222-222222222222', customerSubject: 'customer-a', credits: 42, amountMinor: 2900, currency: 'USD' };

test('legacy v1 credit events remain compatible and route once to wallet credit semantics', () => {
  assert.deepEqual(walletPaymentCommand('payment.succeeded.v1', base), { kind: 'CREDIT', ownerSubject: 'customer-a', paymentId: base.paymentId, credits: 42 });
  assert.equal(walletPaymentCommand('payment.refunded.v1', base)?.kind, 'REFUND');
});

test('v2 credit events require explicit CREDIT_PURCHASE and reject agency subscriptions', () => {
  assert.equal(walletPaymentCommand('payment.succeeded.v2', { ...base, orderType: 'AGENCY_SUBSCRIPTION' }), null);
  assert.equal(walletPaymentCommand('payment.refunded.v2', { ...base, orderType: 'AGENCY_SUBSCRIPTION' }), null);
  assert.equal(walletPaymentCommand('payment.succeeded.v2', { ...base, orderType: 'CREDIT_PURCHASE' })?.kind, 'CREDIT');
  assert.equal(walletPaymentCommand('payment.succeeded.v2', base), null);
});

test('wallet rejects unknown event versions and malformed amounts before side effects', () => {
  assert.equal(walletPaymentCommand('payment.succeeded.v3', { ...base, orderType: 'CREDIT_PURCHASE' }), null);
  assert.equal(walletPaymentCommand('payment.succeeded.v2', { ...base, orderType: 'CREDIT_PURCHASE', credits: 0 }), null);
});
