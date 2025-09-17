const fs = require('fs').promises;
const crypto = require('crypto');
const { constants } = crypto;

/**
 * Convert a certificate file buffer (DER) into a PEM string if needed.
 * If the input already contains PEM header, return as-is.
 */
async function loadCertificateAsPem(certPathOrString) {
	// If input looks like a path, read file
	let raw;
	try {
		// If it's a path, try to read it
		raw = await fs.readFile(certPathOrString);
		// Buffer read succeeded -> it was a file path
		const asString = raw.toString('utf8');
		if (asString.includes('-----BEGIN CERTIFICATE-----')) {
			// Already PEM
			return asString;
		}
		// Otherwise treat as DER and convert to PEM
		const b64 = raw.toString('base64');
		const wrapped = b64.match(/.{1,64}/g).join('\n');
		return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
	} catch (err) {
		// Might be not a file path but a PEM string passed directly:
		const maybePem = String(certPathOrString);
		if (maybePem.includes('-----BEGIN CERTIFICATE-----')) {
			return maybePem;
		}
		// If we can't read path and it's not PEM, rethrow original fs error for clarity
		throw new Error(
			`Failed to load certificate from file and provided input is not PEM. Original error: ${err.message}`
		);
	}
}

/**
 * Generate M-Pesa security credential.
 * - password: plaintext initiator password (string)
 * - certPathOrPem: path to certificate file (e.g., 'ProductionCertificate.cer') OR PEM string
 *
 * Returns: base64 encoded RSA-encrypted password (string)
 */
async function generateSecurityCredential(password, certPathOrPem) {
	if (!password || typeof password !== 'string') {
		throw new Error('Password must be a non-empty string.');
	}
	const pem = await loadCertificateAsPem(certPathOrPem);

	// Make sure password is trimmed and encoded as UTF-8 bytes
	const passwordBuf = Buffer.from(password.trim(), 'utf8');

	// Use RSA PKCS#1 v1.5 padding (not OAEP)
	const encrypted = crypto.publicEncrypt(
		{
			key: pem,
			padding: constants.RSA_PKCS1_PADDING,
		},
		passwordBuf
	);

	return encrypted.toString('base64');
}

module.exports = {
	generateSecurityCredential,
};
