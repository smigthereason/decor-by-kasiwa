export default function MaintenancePage() {
  return (
    <main style={{minHeight:'80vh',display:'grid',placeItems:'center',padding:'2rem',fontFamily:'sans-serif'}}>
      <section style={{maxWidth:520,textAlign:'center'}}>
        <h1 style={{fontSize:'2rem',marginBottom:'1rem'}}>We're updating our store</h1>
        <p>Purchases and stock operations are temporarily paused. Your existing orders and payments remain recorded. Please check back later or contact our team for assistance.</p>
      </section>
    </main>
  );
}
