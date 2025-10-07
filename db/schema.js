/**
 * db/schema.js
 *
 * This file defines the database schema using drizzle-orm for the application's core tables.
 * It exports table definitions for use throughout the backend, including:
 *   - profiles: user accounts and roles
 *   - bookings: reservation and payment details
 *   - (other tables defined below)
 *
 * Each table is defined with its columns, types, constraints, and default values.
 * This schema is used for query building, migrations, and type safety in the application.
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

// profiles (user table - provided earlier)
const profiles = pgTable("profiles", {
	id: uuid("id").primaryKey().notNull(),
	email: text("email").notNull(),
	role: text("role").notNull(),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

// bookings (provided earlier)
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
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

// STK payments
const stk_payments = pgTable("stk_payments", {
	id: serial("id").primaryKey(),
	guest_id: uuid("guest_id").notNull().references(() => profiles.id),
	booking_id: uuid("booking_id").notNull().references(() => bookings.id),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	is_reservation: boolean("is_reservation").default(false),
	amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
	// use varchar/text to avoid bigint runtime config issues
	phone_number: varchar("phone_number", { length: 20 }).notNull(),
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
});

// booking_transactions - aggregates per booking + commission flags
const booking_transactions = pgTable("booking_transactions", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	booking_id: uuid("booking_id").notNull().references(() => bookings.id),
	host_id: uuid("host_id").notNull().references(() => profiles.id),
	reservation_amount: numeric("reservation_amount", { precision: 12, scale: 2 }).default("0"),
	total_amount: numeric("total_amount", { precision: 12, scale: 2 }).default("0"),
	commission_amount: numeric("commission_amount", { precision: 12, scale: 2 }).default("0"),
	commission_applied: boolean("commission_applied").default(false),
	transaction_ids: json("transaction_ids").default(sql`'[]'::jsonb`),
	created_at: timestamp("created_at").defaultNow(),
	updated_at: timestamp("updated_at").defaultNow(),
});

// (optional helpers left intact if you use them, but not required for simplified flows)
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

module.exports = {
	profiles,
	bookings,
	stk_payments,
	b2c_payouts,
	booking_transactions,
	pending_stk,
	payout_requests,
};
