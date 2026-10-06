/*
 * クラスの一覧です。
 * 学生は受験コードを入れるだけで、ここに書いたクラスの中から自分のクラスが自動で選ばれます。
 *
 * クラスを増やすとき：{ id: ..., name: ..., url: ... }, の1行をコピーして書き換えます。
 *   id   … 半角英数字とハイフンだけ。クラス専用のリンク（…/?c=id）に使います
 *   name … 画面に出るクラス名（スプレッドシートの「講座名」が優先されます）
 *   url  … そのクラスのテストのURL（スプレッドシートの「設定」シート13行目）
 */
window.APP_CONFIG = {
  classes: [
    { id: 'joukyu-a', name: '上級A', url: 'https://script.google.com/macros/s/AKfycbxK4-fO9slRs19AWJcFYlG6SGHcMacGDMbvO9na-rBZjXvZ77gB5nPIce_FEFk5KckH/exec' },
    { id: 'joukyu-b', name: '上級B', url: 'https://script.google.com/macros/s/AKfycbwexTafNoGCgoZ3DVXg_DCMpR3382wY4sQr0IscSS5z9oJOdeolv53S16OhhKNhddhu/exec' },
    { id: 'nyumon',   name: '入門',  url: 'https://script.google.com/macros/s/AKfycbwhvdIkVT9DCCLciw18LGVJpVuUZ_Wf80WiDRyp6S15vdUCKEO4uiM_Yg7nA7EceIhhXg/exec' }
  ]
};
