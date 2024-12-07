/// This module contains the general/internal store of the OFT OApp.
///
/// This module should generally not be modified by the OFT/OApp developer. OFT specific data should be stored in the
/// implementation module.
module oft::oft_store {
    use std::table::{Self, Table};

    use oft::oapp_store::OAPP_ADDRESS;

    friend oft::oft_core;

    /// The OFT configuration that is general to all OFT implementations
    struct OftStore has key {
        shared_decimals: u8,
        decimal_conversion_rate: u64,
        v1_compatibility_mode: Table<u32, bool>,
    }

    /// Get the decimal conversion rate of the OFT, this is the multiplier to convert a shared decimals to a local
    /// decimals representation
    public(friend) fun decimal_conversion_rate(): u64 acquires OftStore {
        store().decimal_conversion_rate
    }

    /// Get the shared decimals of the OFT, this is the number of decimals that are preserved on wire transmission
    public(friend) fun shared_decimals(): u8 acquires OftStore {
        store().shared_decimals
    }

    // ============================================= V1 OFT Compatibility =============================================

    /// Set the v1 compatibility mode for an EID
    public(friend) fun set_v1_compatibility_mode(eid: u32, enabled: bool) acquires OftStore {
        assert!(enabled != v1_compatibility_mode(eid), ENO_CHANGE);
        if (enabled) {
            table::upsert(&mut store_mut().v1_compatibility_mode, eid, enabled);
        } else {
            table::remove(&mut store_mut().v1_compatibility_mode, eid);
        };
    }

    /// Get the v1 compatibility mode for an EID
    /// This is public on account for needing to be viewed from an inline function
    public(friend) fun v1_compatibility_mode(eid: u32): bool acquires OftStore {
        *table::borrow_with_default(&store().v1_compatibility_mode, eid, &false)
    }

    // ==================================================== Helpers ===================================================

    inline fun store(): &OftStore { borrow_global(OAPP_ADDRESS()) }

    inline fun store_mut(): &mut OftStore { borrow_global_mut(OAPP_ADDRESS()) }

    // ================================================ Initialization ================================================

    public(friend) fun initialize(shared_decimals: u8, decimal_conversion_rate: u64) acquires OftStore {
        // Prevent re-initialization; the caller computes the decimal conversion rate, which cannot be 0
        assert!(store().decimal_conversion_rate == 0, EALREADY_INITIALIZED);

        store_mut().shared_decimals = shared_decimals;
        store_mut().decimal_conversion_rate = decimal_conversion_rate;
    }

    fun init_module(account: &signer) {
        move_to(account, OftStore {
            shared_decimals: 0,
            decimal_conversion_rate: 0,
            v1_compatibility_mode: table::new(),
        })
    }

    #[test_only]
    public fun init_module_for_test() {
        init_module(&std::account::create_signer_for_test(OAPP_ADDRESS()));
    }

    // ================================================== Error Codes =================================================

    const EALREADY_INITIALIZED: u64 = 1;
    const ENO_CHANGE: u64 = 2;
}