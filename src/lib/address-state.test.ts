import { describe, expect, it } from "vitest";
import { stateFromAddress, stateFromPostcode, stateNamedIn } from "@/lib/address-state";

// 130 §11: the Negeri is worked out from the address by code — a state name
// when the address says one, the postcode otherwise, null when neither.
// Every address here is fictional.

describe("stateNamedIn — the state the address spells out", () => {
  it("finds the plain names and the honorific forms", () => {
    expect(stateNamedIn("No. 12, Jalan Contoh 3, Taman Contoh, 43000 Kajang, Selangor")).toBe("Selangor");
    expect(stateNamedIn("Lot 5, Kampung Contoh, Kuantan, Pahang Darul Makmur")).toBe("Pahang");
    expect(stateNamedIn("3, Lorong Contoh, Georgetown, Penang")).toBe("Pulau Pinang");
    expect(stateNamedIn("88, Jalan Contoh, Malacca")).toBe("Melaka");
    expect(stateNamedIn("Kg Contoh, Seremban, N. Sembilan")).toBe("Negeri Sembilan");
  });

  it("the federal territories, in every common spelling", () => {
    expect(stateNamedIn("21 Jalan Contoh, 50450 Kuala Lumpur")).toBe("WP Kuala Lumpur");
    expect(stateNamedIn("21 Jalan Contoh, W.P. Kuala Lumpur")).toBe("WP Kuala Lumpur");
    expect(stateNamedIn("Presint 9, Putrajaya")).toBe("WP Putrajaya");
    expect(stateNamedIn("Jalan Contoh, Labuan")).toBe("WP Labuan");
    expect(stateNamedIn("Bangsar, KL")).toBe("WP Kuala Lumpur");
  });

  it("'kl' only as its own word — never inside another", () => {
    expect(stateNamedIn("Jalan Klang Lama, Taman Contoh")).toBeNull();
    expect(stateNamedIn("Kampung Kelantan Contoh")).toBe("Kelantan"); // a real name, kept
  });

  it("Chinese punctuation between the parts does not hide the name", () => {
    expect(stateNamedIn("怡保，Perak")).toBe("Perak");
  });

  it("nothing named → null", () => {
    expect(stateNamedIn("No. 7, Jalan Contoh, Taman Contoh")).toBeNull();
  });
});

describe("stateFromPostcode — Pos Malaysia's first two digits", () => {
  it("maps each range to its state", () => {
    expect(stateFromPostcode("43000 Kajang")).toBe("Selangor");
    expect(stateFromPostcode("50450")).toBe("WP Kuala Lumpur");
    expect(stateFromPostcode("62000 Presint 1")).toBe("WP Putrajaya");
    expect(stateFromPostcode("10200 George Town")).toBe("Pulau Pinang");
    expect(stateFromPostcode("80000 Johor Bahru")).toBe("Johor");
    expect(stateFromPostcode("88000 Kota Kinabalu")).toBe("Sabah");
    expect(stateFromPostcode("93000 Kuching")).toBe("Sarawak");
    expect(stateFromPostcode("87000")).toBe("WP Labuan");
    expect(stateFromPostcode("01000 Kangar")).toBe("Perlis");
    expect(stateFromPostcode("39000 Tanah Rata")).toBe("Pahang"); // Cameron Highlands
    expect(stateFromPostcode("75000 Melaka")).toBe("Melaka");
    expect(stateFromPostcode("70000 Seremban")).toBe("Negeri Sembilan");
  });

  it("a number that is not a five-digit postcode is not read as one", () => {
    expect(stateFromPostcode("No. 43000123 Jalan Contoh")).toBeNull();
    expect(stateFromPostcode("Lot 4300, Jalan Contoh")).toBeNull();
    expect(stateFromPostcode("IC 900101-10-1234")).toBeNull();
  });

  it("a gap in the allocation → null, never a guess", () => {
    expect(stateFromPostcode("03000")).toBeNull();
    expect(stateFromPostcode("99000")).toBeNull();
  });
});

describe("stateFromAddress — name first, postcode second, else ask", () => {
  it("the spelled-out state wins over the postcode when both are there", () => {
    // A misread postcode must not overrule what the page says in words.
    expect(stateFromAddress("No. 5, Jalan Contoh, 43000 Kajang, Selangor")).toBe("Selangor");
    expect(stateFromAddress("No. 5, Jalan Contoh, 80000 Kajang, Selangor")).toBe("Selangor");
  });

  it("falls back to the postcode", () => {
    expect(stateFromAddress("No. 5, Jalan Contoh, 43000 Kajang")).toBe("Selangor");
  });

  it("empty / nothing → null", () => {
    expect(stateFromAddress("")).toBeNull();
    expect(stateFromAddress(null)).toBeNull();
    expect(stateFromAddress(undefined)).toBeNull();
    expect(stateFromAddress("No. 7, Jalan Contoh")).toBeNull();
  });
});
