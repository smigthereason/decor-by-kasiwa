import PageHeading from "@/components/backoffice/PageHeading";
import OrderTable from "@/components/backoffice/OrderTable";
import { orders } from "@/lib/operations/data";

export default function StoreOrdersPage() {
  const storeOrders = orders.filter((order) => order.assignedStore);

  return (
    <>
      <PageHeading
        eyebrow="Order Queue"
        title="Orders assigned to the store."
        body="The store sees only fulfilment-relevant orders that have been handed off by the admin office."
      />

      <section className="bg-[#faf7f2] p-5 sm:p-7 lg:p-9">
        <OrderTable orders={storeOrders} mode="store" />
      </section>
    </>
  );
}
