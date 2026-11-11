<template>
  <v-card class="battery-card" flat>
    <v-card-text class="pa-6">
      <div class="text-h6 font-weight-regular mb-4">电池</div>
      <div class="d-flex flex-column align-center justify-center">
        <div class="battery-circle">
          <div class="battery-background"></div>
          <div class="battery-level" :style="batteryLevelStyle"></div>
          <div class="battery-text">{{ batteryPercentage }}%</div>
        </div>
        <div class="mt-4 field-container">
          <div class="field-item" v-if="!isNaN(batteryChargeCounter)">
            <span class="field-item-label">剩余电量</span>
            <span class="field-item-value">{{ batteryChargeCounter }}mAh</span>
          </div>
          <div class="field-item" v-if="!isNaN(batteryCurrent)">
            <span class="field-item-label">当前电流</span>
            <span class="field-item-value">{{ formattedBatteryCurrent }}mA</span>
          </div>
          <div class="field-item" v-if="!isNaN(voltage)">
            <span class="field-item-label">电池电压</span>
            <span class="field-item-value">{{ formattedVoltage }}V</span>
          </div>
          <div class="field-item" v-if="!isNaN(temperature)">
            <span class="field-item-label">电池温度</span>
            <span class="field-item-value">{{ temperature }}°C</span>
          </div>
          <div class="field-item" v-if="!isNaN(batteryHealth)">
            <span class="field-item-label">电池健康</span>
            <span class="field-item-value">{{ batteryHealth }}%</span>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  batteryPercentage: {
    type: Number,
    required: true,
    validator: (value: number) => value >= 0 && value <= 100,
  },
  voltage: {
    type: Number,
    required: true,
  },
  temperature: {
    type: Number,
    required: true,
  },
  batteryHealth: {
    type: Number,
    required: true,
  },
  batteryChargeCounter: {
    type: Number,
    required: true,
  },
  batteryCurrent: {
    type: Number,
    required: true,
  },
});

const batteryLevelStyle = computed(() => {
  return {
    height: `${props.batteryPercentage}%`,
  }
});

const formattedVoltage = computed(() => {
  return isNaN(props.voltage) ? '0.000' : props.voltage.toFixed(3);
});

const formattedBatteryCurrent = computed(() => {
  return props.batteryCurrent > 0 ? `+${props.batteryCurrent}` : props.batteryCurrent;
});
</script>

<style scoped>
.battery-card {
  background: white;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  min-width: 280px;
}

.battery-circle {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 auto;
}

.battery-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.05);
}

.battery-level {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(to bottom, #ef5350, #42a5f5);
  transition: height 0.3s ease;
}

.battery-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 18px;
  font-weight: 500;
  z-index: 2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.field-item {
  width: 100%;
  font-size: 14px;
}

.field-item-label {
  font-weight: 500;
  color: var(--v-text-primary);
  margin-right: .5em;
}

.field-item-value {
  color: var(--v-text-secondary);
}
</style>
