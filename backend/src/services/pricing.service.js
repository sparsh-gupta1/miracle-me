const { ListenerGlobalPricing, ListenerCustomPricing, AstrologerCustomPricing, User } = require("../models");
const { Op } = require("sequelize");

// ========== LISTENER GLOBAL PRICING ==========

/**
 * Create a new listener global pricing entry (insert-only for history)
 * @param {Object} data - { serviceType, pricePerMinute, effectiveFrom }
 * @param {string} adminId - ID of the admin creating the pricing
 * @returns {Promise<ListenerGlobalPricing>}
 */
const createListenerGlobalPricing = async (data, adminId) => {
    try {
        const effectiveDate = data.effectiveFrom ? new Date(data.effectiveFrom) : new Date();

        // Normalize to start of day for date comparison
        const startOfDay = new Date(effectiveDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(effectiveDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Check if entry with same serviceType, price, and date already exists
        const existing = await ListenerGlobalPricing.findOne({
            where: {
                serviceType: data.serviceType,
                pricePerMinute: data.pricePerMinute,
                effectiveFrom: {
                    [Op.gte]: startOfDay,
                    [Op.lte]: endOfDay,
                },
            },
        });

        // If duplicate exists, return it as if it was just created (idempotent)
        if (existing) {
            return existing;
        }

        // Verify admin existence to avoid FK constraint error
        const admin = await User.findByPk(adminId);
        if (!admin) {
            throw new Error(`Admin user with ID ${adminId} not found. Cannot create pricing.`);
        }

        const pricing = await ListenerGlobalPricing.create({
            serviceType: data.serviceType,
            pricePerMinute: data.pricePerMinute,
            effectiveFrom: effectiveDate,
            createdBy: adminId,
            isActive: true,
        });
        return pricing;
    } catch (error) {
        throw error;
    }
};

/**
 * Update listener global pricing (sets isActive flag)
 * @param {string} pricingId - ID of the pricing entry to update
 * @param {Object} data - { pricePerMinute, isActive }
 * @returns {Promise<ListenerGlobalPricing>}
 */
const updateListenerGlobalPricing = async (pricingId, data) => {
    try {
        const pricing = await ListenerGlobalPricing.findByPk(pricingId);
        if (!pricing) {
            throw new Error("Listener pricing not found");
        }

        await pricing.update({
            pricePerMinute: data.pricePerMinute,
            isActive: data.isActive !== undefined ? data.isActive : pricing.isActive,
        });
        return pricing;
    } catch (error) {
        throw error;
    }
};

/**
 * Get pricing history for a service type
 * @param {string} serviceType - 'chat', 'audio_call', 'video_call'
 * @returns {Promise<Array<ListenerGlobalPricing>>}
 */
const getListenerPricingHistory = async (serviceType) => {
    try {
        return await ListenerGlobalPricing.findAll({
            where: { serviceType: serviceType },
            order: [["effectiveFrom", "DESC"]],
            include: [
                {
                    model: User,
                    as: "creator",
                    attributes: ["id", "name", "email"],
                },
            ],
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Get a comprehensive overview of listener pricing for all service types
 * Includes current active price, upcoming prices, and recent history
 * @returns {Promise<Object>}
 */
const getListenerPricingOverview = async () => {
    try {
        const serviceTypes = ["chat", "audio_call", "video_call"];
        const defaultPricing = {
            chat: 5.00,
            audio_call: 10.00,
            video_call: 15.00
        };

        const now = new Date();
        const overview = {};

        await Promise.all(
            serviceTypes.map(async (type) => {
                // 1. Get current active price
                const current = await ListenerGlobalPricing.findOne({
                    where: {
                        serviceType: type,
                        isActive: true,
                        effectiveFrom: { [Op.lte]: now },
                    },
                    order: [["effectiveFrom", "DESC"]],
                });

                // 2. Get upcoming prices
                const upcoming = await ListenerGlobalPricing.findAll({
                    where: {
                        serviceType: type,
                        isActive: true,
                        effectiveFrom: { [Op.gt]: now },
                    },
                    order: [["effectiveFrom", "ASC"]],
                });

                // 3. Get recent history (past effective prices excluding the current one)
                const history = await ListenerGlobalPricing.findAll({
                    where: {
                        serviceType: type,
                        effectiveFrom: { [Op.lt]: current ? current.effectiveFrom : now },
                    },
                    order: [["effectiveFrom", "DESC"]],
                    limit: 5,
                    include: [
                        {
                            model: User,
                            as: "creator",
                            attributes: ["id", "name"],
                        },
                    ],
                });

                overview[type] = {
                    current: current ? {
                        id: current.id,
                        pricePerMinute: current.pricePerMinute,
                        effectiveFrom: current.effectiveFrom,
                        isActive: current.isActive,
                        source: "database"
                    } : {
                        id: "default-" + type,
                        pricePerMinute: defaultPricing[type].toFixed(2),
                        effectiveFrom: new Date(0),
                        isActive: true,
                        source: "fallback"
                    },
                    upcoming: upcoming.map(p => ({
                        id: p.id,
                        pricePerMinute: p.pricePerMinute,
                        effectiveFrom: p.effectiveFrom,
                        isActive: p.isActive
                    })),
                    history: history.map(p => ({
                        id: p.id,
                        pricePerMinute: p.pricePerMinute,
                        effectiveFrom: p.effectiveFrom,
                        createdBy: p.creator ? p.creator.name : "System"
                    }))
                };
            })
        );

        return overview;
    } catch (error) {
        throw error;
    }
};

/**
 * Get all current (active) listener pricing with fallbacks
 * Returns a consolidated list of the latest price for each service type
 * @returns {Promise<Array<Object>>}
 */
const getAllCurrentListenerPricing = async () => {
    try {
        const overview = await getListenerPricingOverview();

        // Return only the current prices in the original format for backward compatibility
        return Object.keys(overview).map(type => ({
            serviceType: type,
            ...overview[type].current
        }));
    } catch (error) {
        throw error;
    }
};

/**
 * Get current active listener pricing for a service type
 * @param {string} serviceType
 * @returns {Promise<ListenerGlobalPricing|null>}
 */
const getCurrentListenerPricing = async (serviceType) => {
    try {
        return await ListenerGlobalPricing.findOne({
            where: {
                serviceType: serviceType,
                isActive: true,
                effectiveFrom: { [Op.lte]: new Date() },
            },
            order: [["effectiveFrom", "DESC"]],
        });
    } catch (error) {
        throw error;
    }
};

// ========== LISTENER CUSTOM PRICING ==========

/**
 * Create / upsert per-listener custom pricing
 * @param {string} listenerId
 * @param {Object} data - { serviceType, pricePerMinute }
 * @returns {Promise<ListenerCustomPricing>}
 */
const createListenerCustomPricing = async (listenerId, data) => {
    try {
        // Verify the target user exists and is a listener
        const listener = await User.findByPk(listenerId);
        if (!listener || listener.role !== "listener") {
            throw new Error(`Listener with ID ${listenerId} not found`);
        }

        // Upsert: if pricing for this serviceType already exists, update it
        const existing = await ListenerCustomPricing.findOne({
            where: {
                listenerId: listenerId,
                serviceType: data.serviceType,
            },
        });

        if (existing) {
            await existing.update({
                pricePerMinute: data.pricePerMinute,
                isActive: true,
            });
            return existing;
        }

        const pricing = await ListenerCustomPricing.create({
            listenerId: listenerId,
            serviceType: data.serviceType,
            pricePerMinute: data.pricePerMinute,
            isActive: true,
        });
        return pricing;
    } catch (error) {
        throw error;
    }
};

/**
 * Update listener custom pricing
 * @param {string} listenerId
 * @param {string} serviceType
 * @param {Object} data - { pricePerMinute, isActive }
 * @returns {Promise<ListenerCustomPricing>}
 */
const updateListenerCustomPricing = async (listenerId, serviceType, data) => {
    try {
        const pricing = await ListenerCustomPricing.findOne({
            where: {
                listenerId: listenerId,
                serviceType: serviceType,
            },
        });

        if (!pricing) {
            throw new Error(`Custom pricing for ${serviceType} not found for this listener`);
        }

        await pricing.update({
            pricePerMinute: data.pricePerMinute !== undefined ? data.pricePerMinute : pricing.pricePerMinute,
            isActive: data.isActive !== undefined ? data.isActive : pricing.isActive,
        });
        return pricing;
    } catch (error) {
        throw error;
    }
};

/**
 * Delete listener custom pricing (revert to global)
 * @param {string} listenerId
 * @param {string} serviceType
 * @returns {Promise<boolean>}
 */
const deleteListenerCustomPricing = async (listenerId, serviceType) => {
    try {
        const deleted = await ListenerCustomPricing.destroy({
            where: {
                listenerId: listenerId,
                serviceType: serviceType,
            },
        });
        return deleted > 0;
    } catch (error) {
        throw error;
    }
};

/**
 * Get all custom pricing rows for a listener
 * @param {string} listenerId
 * @returns {Promise<Array<ListenerCustomPricing>>}
 */
const getListenerCustomPricing = async (listenerId) => {
    try {
        return await ListenerCustomPricing.findAll({
            where: { listenerId: listenerId },
            order: [["serviceType", "ASC"]],
        });
    } catch (error) {
        throw error;
    }
};

// ========== ASTROLOGER CUSTOM PRICING ==========

/**
 * Create astrologer custom pricing
 * @param {string} astrologerId
 * @param {Object} data - { serviceType, pricePerMinute }
 * @returns {Promise<AstrologerCustomPricing>}
 */
const createAstrologerPricing = async (astrologerId, data) => {
    try {
        // Verify the target user exists and is an astrologer, so admin can't
        // attach pricing to a non-astrologer / non-existent id (avoids FK errors)
        const astrologer = await User.findByPk(astrologerId);
        if (!astrologer || astrologer.role !== "astrologer") {
            throw new Error(`Astrologer with ID ${astrologerId} not found`);
        }

        // Check if pricing already exists for this service type
        const existing = await AstrologerCustomPricing.findOne({
            where: {
                astrologerId: astrologerId,
                serviceType: data.serviceType,
                userId: null,
            },
        });

        if (existing) {
            await existing.update({
                pricePerMinute: data.pricePerMinute,
                isActive: true,
            });
            return existing;
        }


        const pricing = await AstrologerCustomPricing.create({
            astrologerId: astrologerId,
            userId: null, // Always null as per requirements
            serviceType: data.serviceType,
            pricePerMinute: data.pricePerMinute,
            isActive: true,
        });
        return pricing;
    } catch (error) {
        throw error;
    }
};

/**
 * Update astrologer custom pricing
 * @param {string} astrologerId
 * @param {string} serviceType
 * @param {Object} data - { pricePerMinute, isActive }
 * @returns {Promise<AstrologerCustomPricing>}
 */
const updateAstrologerPricing = async (astrologerId, serviceType, data) => {
    try {
        const pricing = await AstrologerCustomPricing.findOne({
            where: {
                astrologerId: astrologerId,
                serviceType: serviceType,
                userId: null,
            },
        });

        if (!pricing) {
            throw new Error(`Custom pricing for ${serviceType} not found`);
        }

        await pricing.update({
            pricePerMinute: data.pricePerMinute,
            isActive: data.isActive !== undefined ? data.isActive : pricing.isActive,
        });
        return pricing;
    } catch (error) {
        throw error;
    }
};

/**
 * Delete astrologer custom pricing
 * @param {string} astrologerId
 * @param {string} serviceType
 * @returns {Promise<boolean>}
 */
const deleteAstrologerPricing = async (astrologerId, serviceType) => {
    try {
        const deleted = await AstrologerCustomPricing.destroy({
            where: {
                astrologerId: astrologerId,
                serviceType: serviceType,
                userId: null,
            },
        });
        return deleted > 0;
    } catch (error) {
        throw error;
    }
};

/**
 * Get all custom pricing for an astrologer
 * @param {string} astrologerId
 * @returns {Promise<Array<AstrologerCustomPricing>>}
 */
const getAstrologerPricing = async (astrologerId) => {
    try {
        return await AstrologerCustomPricing.findAll({
            where: {
                astrologerId: astrologerId,
                userId: null,
            },
            order: [["serviceType", "ASC"]],
        });
    } catch (error) {
        throw error;
    }
};

// ========== EFFECTIVE PRICING ==========

/**
 * Get effective pricing for billing/UI
 * Checks listener custom pricing OR astrologer custom pricing depending on
 * the earner's role, then falls back to the global listener pricing, then
 * hardcoded defaults.
 * @param {string} earnerId - ID of the listener or astrologer earning on the call
 * @param {string} serviceType - 'chat' | 'audio_call' | 'video_call'
 * @returns {Promise<Object>}
 */
const getEffectivePricing = async (earnerId, serviceType) => {
    try {
        // Determine the earner's role to pick the right custom-pricing table
        const earner = await User.findByPk(earnerId, { attributes: ["id", "role"] });

        if (earner && earner.role === "listener") {
            // ── 1. Check listener-specific custom pricing ──
            const customPricing = await ListenerCustomPricing.findOne({
                where: {
                    listenerId: earnerId,
                    serviceType: serviceType,
                    isActive: true,
                },
            });

            if (customPricing) {
                return {
                    pricePerMinute: customPricing.pricePerMinute,
                    serviceType: serviceType,
                    pricingType: "custom",
                    source: "listener_custom_pricing",
                    pricingId: customPricing.id,
                };
            }
        } else {
            // ── 1. Check astrologer custom pricing ──
            const customPricing = await AstrologerCustomPricing.findOne({
                where: {
                    astrologerId: earnerId,
                    serviceType: serviceType,
                    userId: null,
                    isActive: true,
                },
            });

            if (customPricing) {
                return {
                    pricePerMinute: customPricing.pricePerMinute,
                    serviceType: serviceType,
                    pricingType: "custom",
                    source: "astrologer_custom_pricing",
                    pricingId: customPricing.id,
                };
            }
        }

        // ── 2. Fallback to listener global pricing ──
        const globalPricing = await getCurrentListenerPricing(serviceType);

        if (globalPricing) {
            return {
                pricePerMinute: globalPricing.pricePerMinute,
                serviceType: serviceType,
                pricingType: "global",
                source: "listener_global_pricing",
                pricingId: globalPricing.id,
            };
        }

        // ── 3. Fallback to hardcoded defaults ──
        const defaultPricing = {
            chat: 5.00,
            audio_call: 10.00,
            video_call: 15.00
        };

        const fallbackPrice = defaultPricing[serviceType];

        if (fallbackPrice !== undefined) {
            return {
                pricePerMinute: fallbackPrice,
                serviceType: serviceType,
                pricingType: "fallback",
                source: "code_default",
                pricingId: null,
                message: "Using default fallback pricing"
            };
        }

        // No pricing found at all
        return {
            pricePerMinute: null,
            serviceType: serviceType,
            pricingType: null,
            source: null,
            pricingId: null,
            message: "No pricing configured for this service type",
        };
    } catch (error) {
        throw error;
    }
};


/**
 * Get current effective pricing for the logged-in user (listener or astrologer)
 * @param {string} userId
 * @param {string} role
 * @returns {Promise<Object>}
 */
const getMyCurrentPricing = async (userId, role) => {
    try {
        const serviceTypes = ["chat", "audio_call", "video_call"];
        const pricing = {};

        await Promise.all(
            serviceTypes.map(async (type) => {
                let effectivePrice;
                if (role === "astrologer") {
                    effectivePrice = await getEffectivePricing(userId, type);
                } else if (role === "listener") {
                    // Check for listener-specific custom pricing first
                    const customPricing = await ListenerCustomPricing.findOne({
                        where: {
                            listenerId: userId,
                            serviceType: type,
                            isActive: true,
                        },
                    });

                    if (customPricing) {
                        effectivePrice = {
                            pricePerMinute: customPricing.pricePerMinute,
                            serviceType: type,
                            pricingType: "custom",
                            source: "listener_custom_pricing",
                            pricingId: customPricing.id,
                        };
                    } else {
                        // Fall back to global listener pricing
                        const globalPricing = await getCurrentListenerPricing(type);
                        if (globalPricing) {
                            effectivePrice = {
                                pricePerMinute: globalPricing.pricePerMinute,
                                serviceType: type,
                                pricingType: "global",
                                source: "listener_global_pricing",
                                pricingId: globalPricing.id,
                            };
                        } else {
                            const defaultPricing = {
                                chat: 5.00,
                                audio_call: 10.00,
                                video_call: 15.00
                            };
                            effectivePrice = {
                                pricePerMinute: defaultPricing[type],
                                serviceType: type,
                                pricingType: "fallback",
                                source: "code_default",
                                pricingId: null,
                            };
                        }
                    }
                } else {
                    // for regular users or others, use global pricing
                    const globalPricing = await getCurrentListenerPricing(type);
                    if (globalPricing) {
                        effectivePrice = {
                            pricePerMinute: globalPricing.pricePerMinute,
                            serviceType: type,
                            pricingType: "global",
                            source: "listener_global_pricing",
                            pricingId: globalPricing.id,
                        };
                    } else {
                        // Fallback
                        const defaultPricing = {
                            chat: 5.00,
                            audio_call: 10.00,
                            video_call: 15.00
                        };
                        effectivePrice = {
                            pricePerMinute: defaultPricing[type],
                            serviceType: type,
                            pricingType: "fallback",
                            source: "code_default",
                            pricingId: null,
                        };
                    }
                }
                pricing[type] = effectivePrice;
            })
        );

        return pricing;
    } catch (error) {
        throw error;
    }
};

module.exports = {
    // Listener Global Pricing
    createListenerGlobalPricing,
    updateListenerGlobalPricing,
    getListenerPricingHistory,
    getAllCurrentListenerPricing,
    getListenerPricingOverview,
    getCurrentListenerPricing,
    // Listener Custom Pricing
    createListenerCustomPricing,
    updateListenerCustomPricing,
    deleteListenerCustomPricing,
    getListenerCustomPricing,
    // Astrologer Custom Pricing
    createAstrologerPricing,
    updateAstrologerPricing,
    deleteAstrologerPricing,
    getAstrologerPricing,
    // Effective Pricing
    getEffectivePricing,
    getMyCurrentPricing,
};
