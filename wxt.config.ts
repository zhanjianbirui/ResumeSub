import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'ResumeSub',
    description: '简历一键投递：本地加密档案 + 自动填写',
    permissions: ['storage', 'alarms'],
  },
});
