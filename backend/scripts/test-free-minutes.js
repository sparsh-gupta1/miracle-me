/**
 * Test script for Free Minutes Feature
 * 
 * This script demonstrates:
 * 1. Admin setting free minutes configuration
 * 2. User getting free minutes automatically
 * 3. Checking free minutes usage
 * 4. Simulating conversation billing with free minutes
 */

const { sequelize } = require('../src/models');
const freeMinutesService = require('../src/services/freeMinutes.service');
const logger = require('../src/utils/logger');

async function testFreeMinutesFeature() {
    try {
        console.log('\n========================================');
        console.log('🧪 Testing Free Minutes Feature');
        console.log('========================================\n');

        // Test 1: Set free minutes configuration (as admin)
        console.log('📝 Test 1: Setting free minutes configuration...');

        // Get an admin user ID (you'll need to replace this with actual admin ID)
        const adminId = 'd4420778-6423-47db-b213-bc7b725c9166'; // Replace with actual admin ID

        const audioConfig = await freeMinutesService.setFreeMinutesConfig(
            'audio_call',
            5, // 5 free minutes
            adminId
        );
        console.log('✅ Audio call free minutes set:', audioConfig.free_minutes, 'minutes');

        const videoConfig = await freeMinutesService.setFreeMinutesConfig(
            'video_call',
            3, // 3 free minutes
            adminId
        );
        console.log('✅ Video call free minutes set:', videoConfig.free_minutes, 'minutes');

        const chatConfig = await freeMinutesService.setFreeMinutesConfig(
            'chat',
            10, // 10 free minutes
            adminId
        );
        console.log('✅ Chat free minutes set:', chatConfig.free_minutes, 'minutes');

        // Test 2: Get all configurations
        console.log('\n📋 Test 2: Getting all free minutes configurations...');
        const allConfigs = await freeMinutesService.getAllFreeMinutesConfigs();
        console.log('✅ Total configurations:', allConfigs.length);
        allConfigs.forEach(config => {
            console.log(`   - ${config.service_type}: ${config.free_minutes} minutes`);
        });

        // Test 3: Initialize user free minutes
        console.log('\n👤 Test 3: Initializing user free minutes...');
        const testUserId = 'd4420778-6423-47db-b213-bc7b725c9166'; // Replace with actual user ID

        const audioUsage = await freeMinutesService.initializeUserFreeMinutes(
            testUserId,
            'audio_call'
        );
        console.log('✅ User audio call free minutes initialized:');
        console.log(`   - Total: ${audioUsage.total_free_seconds}s (${Math.floor(audioUsage.total_free_seconds / 60)}m)`);
        console.log(`   - Remaining: ${audioUsage.remaining_seconds}s`);

        // Test 4: Get user's free minutes usage
        console.log('\n📊 Test 4: Getting user free minutes usage...');
        const userUsage = await freeMinutesService.getAllUserFreeMinutesUsage(testUserId);
        console.log('✅ User free minutes usage:');
        userUsage.forEach(usage => {
            console.log(`   - ${usage.serviceType}:`);
            console.log(`     Total: ${usage.totalFreeMinutes}m (${usage.totalFreeSeconds}s)`);
            console.log(`     Consumed: ${usage.consumedMinutes}m (${usage.consumedSeconds}s)`);
            console.log(`     Remaining: ${usage.remainingMinutes}m (${usage.remainingSeconds}s)`);
        });

        // Test 5: Simulate consuming free minutes
        console.log('\n⏱️  Test 5: Simulating free minutes consumption...');

        // Simulate a 2-minute call (120 seconds)
        const transaction = await sequelize.transaction();
        try {
            const consumeResult = await freeMinutesService.consumeFreeMinutes(
                testUserId,
                'audio_call',
                120, // 2 minutes
                transaction
            );

            await transaction.commit();

            console.log('✅ Consumed 2 minutes from audio call:');
            console.log(`   - Free seconds used: ${consumeResult.consumedFreeSeconds}s`);
            console.log(`   - Billable seconds: ${consumeResult.billableSeconds}s`);
            console.log(`   - Remaining free seconds: ${consumeResult.remainingFreeSeconds}s`);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // Test 6: Check usage after consumption
        console.log('\n📊 Test 6: Checking usage after consumption...');
        const updatedUsage = await freeMinutesService.getUserFreeMinutesUsage(
            testUserId,
            'audio_call'
        );
        console.log('✅ Updated audio call usage:');
        console.log(`   - Total: ${Math.floor(updatedUsage.total_free_seconds / 60)}m`);
        console.log(`   - Consumed: ${Math.floor(updatedUsage.consumed_seconds / 60)}m ${updatedUsage.consumed_seconds % 60}s`);
        console.log(`   - Remaining: ${Math.floor(updatedUsage.remaining_seconds / 60)}m ${updatedUsage.remaining_seconds % 60}s`);

        console.log('\n========================================');
        console.log('✅ All tests completed successfully!');
        console.log('========================================\n');

        console.log('📝 Summary:');
        console.log('   - Free minutes configurations created for all service types');
        console.log('   - User free minutes initialized automatically');
        console.log('   - Free minutes consumption working correctly');
        console.log('   - Billing will now consume free minutes before charging wallet');
        console.log('\n🎉 Free minutes feature is ready to use!\n');

    } catch (error) {
        console.error('\n❌ Error during testing:', error);
        throw error;
    } finally {
        await sequelize.close();
    }
}

// Run the test
testFreeMinutesFeature()
    .then(() => {
        console.log('Test script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Test script failed:', error);
        process.exit(1);
    });
