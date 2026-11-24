/**
 * Masks a mobile number for logging purposes.
 * Example: 919876543210 -> 91xxxxxx3210
 * @param {string} mobileNumber 
 * @returns {string}
 */
const maskMobile = (mobileNumber) => {
    if (!mobileNumber) return "N/A";
    const str = mobileNumber.toString();
    if (str.length < 4) return str;
    const start = str.slice(0, 2);
    const end = str.slice(-4);
    const masked = "x".repeat(Math.max(0, str.length - 6));
    return `${start}${masked}${end}`;
};

module.exports = { maskMobile };
