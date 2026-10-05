<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { navigateToView } from '../utils/navigation'

interface HelpFeature {
  id: string
  icon: string
  title: string
  tagline: string
  summary: string
  steps: string[]
  tip?: string
}

const quickStart = [
  { no: '1', title: '看总览', detail: '打开 App 先看关键指标' },
  { no: '2', title: '处理告警', detail: '异常、离线优先闭环' },
  { no: '3', title: '记待办', detail: '轮换巡检不遗漏' },
]

const features: HelpFeature[] = [
  {
    id: 'dashboard',
    icon: 'home',
    title: '总览',
    tagline: '打开 App 的第一屏',
    summary: '一屏掌握在线牲畜、健康率、草场压力和今日告警。',
    steps: [
      '登录后默认进入「总览」，顶部四张卡片是牧场关键指标。',
      '在「3D 牧场总览」里点击任意点位，可查看对应牲畜。',
      '「今日待办」里点右侧按钮，即可把当天事项标记为已完成。',
      '点「查看全部」「分区详情」，可直接跳到告警、草场页面。',
      '数据不是最新时，点右上角「刷新点位」重新加载。',
    ],
    tip: '若显示「后台未连接」，表示网络或服务端异常，请先检查网络。',
  },
  {
    id: 'alerts',
    icon: 'alert',
    title: '告警',
    tagline: '优先处理异常',
    summary: '集中处理牲畜体温、草场压力和设备离线等告警。',
    steps: [
      '顶部按「全部 / 异常 / 需关注 / 离线」筛选告警。',
      '点一条告警，查看触发对象、触发时间和建议动作。',
      '点「定位到地图」，跳到总览查看具体位置。',
      '现场处理完后点「标记已处理」，告警进入已闭环。',
    ],
  },
  {
    id: 'livestock',
    icon: 'livestock',
    title: '牲畜',
    tagline: '管好每一头',
    summary: '维护牲畜档案，查看健康状态、体温、步数和所属草场。',
    steps: [
      '用「全部 / 正常 / 需关注 / 异常 / 离线」筛选牲畜。',
      '点任意一头，查看完整档案详情。',
      '点右上角「添加牲畜」：先选“购入”或“生产”，再填写耳标号、品种、性别、日期、所属草场、牧户等。',
      '选“生产”需指定母亲；选“购入”可填供应商与购入价格。',
      '保存后自动同步到 Web 管理后台；点「导出列表」可导出牲畜清单。',
    ],
  },
  {
    id: 'pasture',
    icon: 'pasture',
    title: '草场',
    tagline: '分区调度有依据',
    summary: '查看各草场分区的载畜量、压力指数和草层情况。',
    steps: [
      '页面顶部显示优良草场数量与最高压力指数。',
      '点任意分区，查看面积、质量等级、当前载畜和压力指数。',
      '详情里还会显示植被覆盖度、草层高度和土壤湿度，作为轮换依据。',
    ],
  },
  {
    id: 'consultation',
    icon: 'message',
    title: 'AI 问诊',
    tagline: '牲畜健康随时问',
    summary: '遇到牲畜健康问题，向 AI 问诊助手描述情况获取建议。',
    steps: [
      '从「我的 → 在线问诊」进入。',
      '在输入框描述畜种、症状和持续时间，点发送。',
      '点右上角「新对话」开始新的问诊。',
      '点「查看历史会话」回看最近 30 天的问诊记录。',
    ],
    tip: 'AI 建议仅供参考，紧急情况请及时联系兽医。',
  },
  {
    id: 'todo',
    icon: 'todo',
    title: '待办事项',
    tagline: '日常安排不遗漏',
    summary: '记录轮换、巡检、防疫、维护、设备等事项，首页自动显示当天待办。',
    steps: [
      '进入「我的 → 待办事项」，点「添加」。',
      '选择类型：草场轮换 / 日常巡检 / 防疫接种 / 草场维护 / 设备检查 / 自定义。',
      '填写日期、时间和备注，再按类型补充信息（轮换选起始与目标草场，防疫填疫苗，设备填编号）。',
      '保存后在首页「今日待办」可直接点完成；点任意待办可修改或删除。',
    ],
  },
  {
    id: 'profile',
    icon: 'profile',
    title: '账户与设置',
    tagline: '管理登录信息',
    summary: '查看个人信息、修改密码、退出登录。',
    steps: [
      '点右上角头像，打开「账户与安全」。',
      '点「修改密码」，输入当前密码和新密码后保存。',
      '点「退出登录」，可切换到其他账号。',
    ],
  },
]

const faqs = [
  { q: '提示「后台未连接」怎么办？', a: '先检查手机网络，再联系管理员确认 API 服务是否正常。' },
  { q: '改动会保存吗？', a: '牲畜、待办等数据会写入服务端数据库，重新登录后依然保留。' },
  { q: '忘记密码怎么办？', a: '请联系管理员在管理后台重置密码。' },
]

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
    return
  }
  navigateToView('profile')
}
</script>

<template>
  <view class="help">
    <view class="help-top">
      <button class="help-back" type="button" aria-label="返回" @click="goBack">
        <AppIcon name="back" :size="22" />
      </button>
      <view class="help-top-copy">
        <text class="help-top-title">使用帮助</text>
        <text class="help-top-sub">数牧空间 · 操作指引</text>
      </view>
    </view>

    <view class="help-body">
      <view class="help-hero">
        <text class="help-hero-kicker">新手指南</text>
        <text class="help-hero-title">数牧空间怎么用</text>
        <text class="help-hero-desc">一个 App 管好牧场：看总览、处理告警、管牲畜、分草场、问 AI、记待办。</text>
        <view class="help-quick">
          <view v-for="item in quickStart" :key="item.no" class="help-quick-item">
            <text class="help-quick-no">{{ item.no }}</text>
            <text class="help-quick-title">{{ item.title }}</text>
            <text class="help-quick-detail">{{ item.detail }}</text>
          </view>
        </view>
      </view>

      <view class="help-section-head">
        <text class="help-section-title">功能说明</text>
        <text class="help-section-sub">各页面作用与操作步骤</text>
      </view>

      <view class="help-cards">
        <view v-for="feature in features" :key="feature.id" class="help-card">
          <view class="help-card-head">
            <view class="help-card-icon"><AppIcon :name="feature.icon" :size="18" /></view>
            <view class="help-card-copy">
              <text class="help-card-title">{{ feature.title }}</text>
              <text class="help-card-tagline">{{ feature.tagline }}</text>
            </view>
          </view>
          <text class="help-card-summary">{{ feature.summary }}</text>
          <view class="help-steps">
            <view v-for="(step, index) in feature.steps" :key="index" class="help-step">
              <text class="help-step-no">{{ index + 1 }}</text>
              <text class="help-step-text">{{ step }}</text>
            </view>
          </view>
          <view v-if="feature.tip" class="help-tip">
            <text class="help-tip-mark">提示</text>
            <text class="help-tip-text">{{ feature.tip }}</text>
          </view>
        </view>
      </view>

      <view class="help-section-head">
        <text class="help-section-title">常见问题</text>
        <text class="help-section-sub">遇到问题先看这里</text>
      </view>

      <view class="help-card help-faq-card">
        <view v-for="(item, index) in faqs" :key="index" class="help-faq">
          <text class="help-faq-q">问 · {{ item.q }}</text>
          <text class="help-faq-a">答 · {{ item.a }}</text>
        </view>
      </view>

      <view class="help-foot">
        <text class="help-foot-line">数牧空间 v1.0.0</text>
        <text class="help-foot-line">四川 · 阿坝县 · 智慧放牧示范区</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.help {
  max-width: 720px;
  min-height: 100vh;
  margin: 0 auto;
  background: var(--canvas, #f4f6f1);
  color: var(--ink, #1d3029);
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
}
.help-top {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(14px, env(safe-area-inset-top)) 18px 12px;
  background: rgba(244, 246, 241, 0.92);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line, #e7ece6);
}
.help-back {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border: 1px solid var(--line, #e7ece6);
  border-radius: 12px;
  background: #fff;
  color: var(--ink, #1d3029);
}
.help-top-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.help-top-title {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.2;
}
.help-top-sub {
  font-size: 11px;
  color: var(--muted, #7e8b84);
}
.help-body {
  padding: 18px 18px 8px;
}
.help-hero {
  display: flex;
  flex-direction: column;
  padding: 22px 20px;
  border-radius: 20px;
  background: linear-gradient(150deg, #1d3b30 0%, #2f5c46 55%, #3f7a58 100%);
  color: #fff;
  box-shadow: 0 16px 34px rgba(29, 59, 48, 0.24);
}
.help-hero-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #a9d8bd;
}
.help-hero-title {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.help-hero-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.82);
}
.help-quick {
  display: flex;
  gap: 9px;
  margin-top: 18px;
}
.help-quick-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  padding: 12px 11px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.help-quick-no {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #1d3b30;
  font-size: 11px;
  font-weight: 800;
}
.help-quick-title {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 700;
}
.help-quick-detail {
  font-size: 10px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.75);
}
.help-section-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin: 24px 2px 12px;
}
.help-section-title {
  font-size: 16px;
  font-weight: 800;
}
.help-section-sub {
  font-size: 11px;
  color: var(--muted, #7e8b84);
}
.help-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.help-card {
  padding: 17px 16px;
  border: 1px solid var(--line, #e7ece6);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(42, 67, 54, 0.06);
}
.help-card-head {
  display: flex;
  align-items: center;
  gap: 11px;
}
.help-card-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 12px;
  background: var(--green-soft, #e7f0e7);
  color: var(--green, #35634c);
}
.help-card-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.help-card-title {
  font-size: 15px;
  font-weight: 800;
}
.help-card-tagline {
  font-size: 11px;
  color: var(--muted, #7e8b84);
}
.help-card-summary {
  display: block;
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #41554b;
}
.help-steps {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 13px;
}
.help-step {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.help-step-no {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  margin-top: 1px;
  border-radius: 50%;
  background: #eef3ee;
  color: var(--green, #35634c);
  font-size: 11px;
  font-weight: 800;
}
.help-step-text {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.65;
  color: #33473c;
}
.help-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 13px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fdf6e7;
}
.help-tip-mark {
  flex: none;
  font-size: 11px;
  font-weight: 800;
  color: #a16207;
}
.help-tip-text {
  flex: 1;
  font-size: 11.5px;
  line-height: 1.6;
  color: #8a6316;
}
.help-faq-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.help-faq {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.help-faq-q {
  font-size: 13px;
  font-weight: 700;
  color: #22362c;
}
.help-faq-a {
  font-size: 12px;
  line-height: 1.65;
  color: var(--muted, #7e8b84);
}
.help-foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 26px 0 10px;
}
.help-foot-line {
  font-size: 11px;
  color: var(--muted, #7e8b84);
}
@media (max-width: 360px) {
  .help-quick {
    flex-direction: column;
  }
  .help-quick-item {
    flex-direction: row;
    align-items: center;
    gap: 9px;
  }
  .help-quick-title {
    margin-top: 0;
  }
  .help-quick-detail {
    margin-left: auto;
    text-align: right;
  }
}
</style>
