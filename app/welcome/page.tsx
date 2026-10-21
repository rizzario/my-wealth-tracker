import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, CreditCard, Landmark, Receipt, ScanLine, TrendingUp, Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Personal Wealth Hub — รู้ภาพรวมเงินของคุณ',
  description: 'รวมบัญชี เงินออม การลงทุน หนี้สิน และรายรับรายจ่ายไว้ในที่เดียว เริ่มต้นจัดการการเงินส่วนตัวทีละขั้น',
};

const features = [
  { icon: Wallet, title: 'รู้ว่ามีเงินอยู่ที่ไหน', text: 'รวมบัญชี เงินสด เงินออม และหนี้สิน เพื่อดูความมั่งคั่งสุทธิในหน่วยบาท', where: 'ภาพรวม · บัญชี' },
  { icon: TrendingUp, title: 'ติดตามพอร์ตลงทุน', text: 'ดูหุ้นไทยและสหรัฐฯ คริปโต ทอง และกองทุน พร้อมประวัติซื้อขายและผลตอบแทน', where: 'ลงทุน · ประวัติเทรด · วิเคราะห์พอร์ต' },
  { icon: Receipt, title: 'เข้าใจเงินเข้าและเงินออก', text: 'บันทึกรายรับ รายจ่าย และการโอนระหว่างบัญชี แล้วดูรายงานตามหมวดหมู่', where: 'รับ-จ่าย' },
  { icon: ScanLine, title: 'ใช้สลิปช่วยบันทึก', text: 'สแกนสลิป ตรวจยอดเงิน วันที่ และบัญชีให้ถูกต้อง แล้วจึงยืนยันบันทึก', where: 'รับ-จ่าย · สแกนสลิป · Inbox' },
  { icon: CreditCard, title: 'เตรียมพร้อมก่อนถึงวันจ่าย', text: 'ติดตามบัตรเครดิตและภาระประจำ เช่น ประกัน ค่าสมาชิก และรายการผ่อนชำระ', where: 'บัญชี · ภาระประจำ' },
  { icon: Landmark, title: 'มองเห็นเงินออมระยะยาว', text: 'จัดเก็บเงินฝากประจำ PVD หุ้นกู้ และกองทุนลดหย่อนภาษีไว้เป็นสัดส่วน', where: 'ระยะยาว' },
];

export default function WelcomePage() {
  return (
    <div className="welcome-page">
      <a className="welcome-skip" href="#welcome-main">ข้ามไปยังเนื้อหา</a>
      <header className="welcome-header">
        <Link href="/welcome" className="welcome-brand" aria-label="Personal Wealth Hub หน้าแนะนำ">
          <Image src="/MRW_no_background.png" alt="" width={54} height={41} priority />
          <span>Personal Wealth Hub</span>
        </Link>
        <Link className="welcome-signin" href="/login">เข้าสู่ระบบ <ArrowRight size={16} aria-hidden="true" /></Link>
      </header>
      <main id="welcome-main">
        <section className="welcome-hero welcome-width">
          <div>
            <p className="welcome-eyebrow">เงินวันนี้ · แผนวันข้างหน้า</p>
            <h1>เห็นภาพรวมเงิน<br />ของคุณในที่เดียว</h1>
            <p className="welcome-lead">บัญชี เงินออม การลงทุน และรายจ่าย ไม่ต้องดูแยกกันอีกต่อไป Personal Wealth Hub ช่วยให้คุณรู้ว่ามีอะไรอยู่เท่าไร และเงินกำลังไปที่ไหน</p>
            <div className="welcome-actions">
              <Link className="welcome-primary" href="/login">เริ่มต้นใช้งาน <ArrowRight size={18} aria-hidden="true" /></Link>
              <a className="welcome-secondary" href="#features">ดูว่าทำอะไรได้บ้าง</a>
            </div>
            <p className="welcome-caption">เริ่มจากบัญชีเดียว แล้วค่อยเพิ่มข้อมูลตามที่คุณต้องการ</p>
          </div>
          <aside className="welcome-map" aria-label="ข้อมูลที่รวมอยู่ในภาพรวมการเงิน">
            <p className="welcome-eyebrow">ภาพรวมที่เชื่อมถึงกัน</p>
            <h2>จากรายการเล็ก ๆ<br />สู่ภาพการเงินทั้งหมด</h2>
            <ul>
              <li><Wallet aria-hidden="true" /><span><strong>บัญชีและเงินออม</strong><small>เงินพร้อมใช้และเงินที่เก็บไว้</small></span></li>
              <li><TrendingUp aria-hidden="true" /><span><strong>พอร์ตลงทุน</strong><small>มูลค่าและผลตอบแทนของสินทรัพย์</small></span></li>
              <li><CreditCard aria-hidden="true" /><span><strong>หนี้สินและภาระประจำ</strong><small>ยอดปัจจุบันและรายการที่กำลังจะถึง</small></span></li>
            </ul>
            <p className="welcome-map-foot">รวมเป็นความมั่งคั่งสุทธิในหน่วยบาท (THB)</p>
          </aside>
        </section>
        <section id="features" className="welcome-features welcome-width">
          <div className="welcome-section-heading"><p className="welcome-eyebrow">เครื่องมือของคุณ</p><h2>อยากดูภาพรวม<br />หรือลงรายละเอียด ก็ทำได้</h2></div>
          <div className="welcome-feature-grid">
            {features.map(({ icon: Icon, title, text, where }, i) => (
              <article key={title}>
                <div className="welcome-feature-top"><Icon size={23} aria-hidden="true" /><span>0{i + 1}</span></div>
                <h3>{title}</h3><p>{text}</p><small>{where}</small>
              </article>
            ))}
          </div>
        </section>
        <section className="welcome-start" id="getting-started">
          <div className="welcome-width welcome-start-grid">
            <div><p className="welcome-eyebrow">เริ่มต้นทีละขั้น</p><h2>ไม่ต้องตั้งค่าทุกอย่าง<br />ในวันแรก</h2><Link className="welcome-primary" href="/login">เริ่มจากบัญชีแรก <ArrowRight size={18} aria-hidden="true" /></Link></div>
            <ol>
              <li><span>01</span><div><h3>เข้าสู่ระบบ</h3><p>ใช้บัญชีที่รองรับ หรือสมัครด้วยอีเมล</p></div></li>
              <li><span>02</span><div><h3>เพิ่มบัญชีและยอดปัจจุบัน</h3><p>ไปที่ “บัญชี” เพิ่มธนาคาร เงินสด หรือบัตรเครดิต แล้วเพิ่มเงินออมหรือพอร์ตลงทุนได้ภายหลัง</p></div></li>
              <li><span>03</span><div><h3>บันทึกรายการแรก</h3><p>ไปที่ “รับ-จ่าย” เพื่อบันทึกด้วยตัวเอง หรือใช้สลิปช่วยกรอก แล้วกลับมาดูภาพรวม</p></div></li>
            </ol>
          </div>
        </section>
        <section className="welcome-width welcome-faq">
          <p className="welcome-eyebrow">ก่อนเริ่มใช้งาน</p><h2>เข้าใจวิธีทำงานก่อนบันทึก</h2>
          <details open><summary>ต้องเชื่อมต่อบัญชีธนาคารไหม?</summary><p>คุณเพิ่มบัญชีและยอดเงินปัจจุบันด้วยตัวเองได้ เว็บไซต์นี้ใช้ข้อมูลที่คุณบันทึกเพื่อแสดงภาพรวม ไม่ได้ดึงยอดบัญชีธนาคารมาให้อัตโนมัติ</p></details>
          <details><summary>สแกนสลิปแล้ว ยอดเงินจะเปลี่ยนทันทีไหม?</summary><p>สลิปใน Inbox ยังไม่กระทบยอดบัญชี ตรวจยอดเงิน วันที่ ประเภทรายการ และบัญชีให้ถูกต้องก่อนยืนยันบันทึกลงรายรับรายจ่าย</p></details>
          <details><summary>ข้อมูลของฉันถูกจัดการอย่างไร?</summary><p>ต้องเข้าสู่ระบบเพื่อเข้าถึงข้อมูลบัญชีและรายการของคุณ ข้อมูลที่บันทึกจัดเก็บผ่าน Supabase การอ่านสลิปจากภาพอาจส่งภาพไปยังผู้ให้บริการ OCR หรือ AI ตามบริการที่ใช้ ตรวจข้อมูลในภาพก่อนอัปโหลด</p></details>
          <details><summary>ราคาลงทุนอัปเดตตลอดเวลาหรือเปล่า?</summary><p>ราคาสินทรัพย์ที่รองรับสามารถรีเฟรชได้ ส่วนสินทรัพย์บางประเภทต้องกรอกเอง ราคาที่แสดงอาจล่าช้า ควรตรวจเวลาที่อัปเดตก่อนใช้อ้างอิง</p></details>
        </section>
      </main>
      <footer className="welcome-width welcome-footer"><span>Personal Wealth Hub · ภาพการเงินที่คุณดูแลได้</span><Link href="/login">เข้าสู่ระบบ <Check size={16} aria-hidden="true" /></Link></footer>
    </div>
  );
}
