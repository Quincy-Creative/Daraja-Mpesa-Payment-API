/**
 * db/schema.js
 */
const {
	pgTable,
	uuid,
	text,
	timestamp,
	date,
	integer,
	numeric,
	boolean,
	serial,
	varchar,
	json,
  } = require("drizzle-orm/pg-core");
  
  const { sql } = require("drizzle-orm");
  
  // profiles
  const profiles = pgTable("profiles", {
	id: uuid("id").primaryKey().notNull(),
	email: text("email").notNull(),
	role: text("role").notNull(),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  // bookings
  const bookings = pgTable("bookings", {
	id: uuid("id").primaryKey().notNull(),
	listing_id: uuid("listing_id").notNull(),
	guest_id: uuid("guest_id").notNull(),
	host_id: uuid("host_id").notNull(),
	check_in: date("check_in").notNull(),
	check_out: date("check_out").notNull(),
	nights: integer("nights"),
	guests: integer("guests").notNull(),
	status: text("status").notNull().default("pending"),
	payment_status: text("payment_status").notNull().default("unpaid"),
	is_reservation: boolean("is_reservation").default(false),
	reservation_fee: numeric("reservation_fee", { precision: 10, scale: 2 }).default("0"),
	subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
	service_fees: numeric("service_fees", { precision: 10, scale: 2 }).default("0"),
	taxes: numeric("taxes", { precision: 10, scale: 2 }).default("0"),
	total_amount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
	currency: text("currency").default("KES"),
	transaction_id: text("transaction_id"),
	special_requests: text("special_requests"),
	cancellation_reason: text("cancellation_reason"),
	rejection_reason: text("rejection_reason"),
	payment_deadline: timestamp("payment_deadline"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  // STK payments
  const stk_payments = pgTable("stk_payments", {
	id: serial("id").primaryKey(),
	guest_id: uuid("guest_id").references(() => profiles.id),
	booking_id: uuid("booking_id").references(() => bookings.id),
	host_id: uuid("host_id").references(() => profiles.id),
	is_reservation: boolean("is_reservation").default(false),
	amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
	phone_number: numeric("phone_number"),
	mpesa_receipt: varchar("mpesa_receipt", { length: 50 }),
	merchant_request_id: varchar("merchant_request_id", { length: 255 }),
	checkout_request_id: varchar("checkout_request_id", { length: 255 }),
	transaction_date: timestamp("transaction_date"),
	result_code: integer("result_code"),
	result_desc: text("result_desc"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  // B2C payouts
  const b2c_payouts = pgTable("b2c_payouts", {
	id: serial("id").primaryKey(),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	receiverPhoneNumber: text("receiverPhoneNumber"),
	originator_conversation_id: varchar("originator_conversation_id", { length: 100 }),
	conversation_id: varchar("conversation_id", { length: 100 }),
	transaction_id: varchar("transaction_id", { length: 100 }),
	transaction_receipt: varchar("transaction_receipt", { length: 100 }),
	amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
	receiver_name: text("receiver_name"),
	completed_at: timestamp("completed_at"),
	b2c_recipient_is_registered: boolean("b2c_recipient_is_registered"),
	b2c_charges_paid_funds: numeric("b2c_charges_paid_funds", { precision: 12, scale: 2 }),
	result_code: integer("result_code"),
	result_desc: text("result_desc"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });

  // M-Pesa refunds (B2C refunds to guests)
  const mpesa_refunds = pgTable("mpesa_refunds", {
	id: serial("id").primaryKey(),
	guest_id: uuid("guest_id").notNull().references(() => profiles.id),
	receiverphonenumber: text("receiverphonenumber"),
	originator_conversation_id: varchar("originator_conversation_id", { length: 100 }),
	conversation_id: varchar("conversation_id", { length: 100 }),
	transaction_id: varchar("transaction_id", { length: 100 }),
	transaction_receipt: varchar("transaction_receipt", { length: 100 }),
	amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
	receiver_name: text("receiver_name"),
	completed_at: timestamp("completed_at"),
	b2c_recipient_is_registered: boolean("b2c_recipient_is_registered"),
	b2c_charges_paid_funds: numeric("b2c_charges_paid_funds", { precision: 12, scale: 2 }),
	result_code: integer("result_code"),
	result_desc: text("result_desc"),
	status: text("status").notNull().default("pending"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  // booking_transactions - includes reservation_amount & commission_applied
  const booking_transactions = pgTable("booking_transactions", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	booking_id: uuid("booking_id").notNull().references(() => bookings.id),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	reservation_amount: numeric("reservation_amount", { precision: 12, scale: 2 }).default("0"),
	total_amount: numeric("total_amount", { precision: 12, scale: 2 }).default("0"),
	full_amount: numeric("full_amount", { precision: 12, scale: 2 }).default("0"),
	commission_amount: numeric("commission_amount", { precision: 12, scale: 2 }).default("0"),
	commission_applied: boolean("commission_applied").default(false),
	transaction_ids: json("transaction_ids").default(sql`'[]'::jsonb`),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  // pending_stk
  const pending_stk = pgTable("pending_stk", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	guest_id: uuid("guest_id").notNull().references(() => profiles.id),
	booking_id: uuid("booking_id").notNull().references(() => bookings.id),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
	merchant_request_id: varchar("merchant_request_id", { length: 255 }),
	checkout_request_id: varchar("checkout_request_id", { length: 255 }),
	is_reservation: boolean("is_reservation").default(false),
	reservation_fee: numeric("reservation_fee", { precision: 10, scale: 2 }).default("0"),
	created_at: timestamp("created_at").defaultNow(),
  });
  
  // payout_requests
  const payout_requests = pgTable("payout_requests", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
	phone_number: varchar("phone_number", { length: 20 }),
	originator_conversation_id: varchar("originator_conversation_id", { length: 100 }),
	conversation_id: varchar("conversation_id", { length: 100 }),
	transaction_id: varchar("transaction_id", { length: 100 }),
	remote_response: text("remote_response"),
	status: text("status").default("initiated"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  /*
   * Added admin_wallets and host_wallets definitions to match controller expectations.
   * If you prefer managing wallets differently, adjust these accordingly.
   */
  const admin_wallets = pgTable("admin_wallets", {
	id: serial("id").primaryKey(),
	admin_id: uuid("admin_id").notNull().references(() => profiles.id),
	balance: numeric("balance", { precision: 14, scale: 2 }).default("0").notNull(),
	total_commission: numeric("total_commission", { precision: 14, scale: 2 }).default("0").notNull(),
	payable_balance: numeric("payable_balance", { precision: 14, scale: 2 }).default("0").notNull(),
	total_paid_out: numeric("total_paid_out", { precision: 14, scale: 2 }).default("0").notNull(),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  const host_wallets = pgTable("host_wallets", {
	id: serial("id").primaryKey(),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	available_balance: numeric("available_balance", { precision: 14, scale: 2 }).default("0").notNull(),
	pending_balance: numeric("pending_balance", { precision: 14, scale: 2 }).default("0").notNull(),
	withdrawn_total: numeric("withdrawn_total", { precision: 14, scale: 2 }).default("0").notNull(),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  // Official M-Pesa account balances (single row, always updated)
  const official_mpesa_balances = pgTable("official_mpesa_balances", {
	id: serial("id").primaryKey(),
	working_account: numeric("working_account", { precision: 14, scale: 2 }).default("0"),
	utility_account: numeric("utility_account", { precision: 14, scale: 2 }).default("0"),
	charges_paid_account: numeric("charges_paid_account", { precision: 14, scale: 2 }).default("0"),
	merchant_account: numeric("merchant_account", { precision: 14, scale: 2 }).default("0"),
	airtime_purchase_account: numeric("airtime_purchase_account", { precision: 14, scale: 2 }).default("0"),
	organization_settlement_account: numeric("organization_settlement_account", { precision: 14, scale: 2 }).default("0"),
	loan_disbursement_account: numeric("loan_disbursement_account", { precision: 14, scale: 2 }).default("0"),
	advanced_deduction_account: numeric("advanced_deduction_account", { precision: 14, scale: 2 }).default("0"),
	savings_deduction_account: numeric("savings_deduction_account", { precision: 14, scale: 2 }).default("0"),
	sfc_device_insurance_claims_account: numeric("sfc_device_insurance_claims_account", { precision: 14, scale: 2 }).default("0"),
	currency: text("currency").default("KES"),
	transaction_id: text("transaction_id"),
	originator_conversation_id: text("originator_conversation_id"),
	conversation_id: text("conversation_id"),
	bo_completed_time: timestamp("bo_completed_time"),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
  });
  
  module.exports = {
	profiles,
	bookings,
	stk_payments,
	b2c_payouts,
	mpesa_refunds,
	booking_transactions,
	pending_stk,
	payout_requests,
	// new exports
	admin_wallets,
	host_wallets,
	official_mpesa_balances,
  };
  