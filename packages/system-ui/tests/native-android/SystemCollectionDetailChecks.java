package studio.threadlabs.systemui.tests;

import android.content.Context;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;
import studio.threadlabs.systemui.SystemCollectionDetail;
import java.util.ArrayList;

/** Native layout checks; the host must also qualify attached-window adaptation and navigation. */
public final class SystemCollectionDetailChecks {
    private static androidx.slidingpanelayout.widget.SlidingPaneLayout nativePanes(View view) {
        if(view instanceof androidx.slidingpanelayout.widget.SlidingPaneLayout panes)return panes;
        if(view instanceof android.view.ViewGroup group)for(int i=0;i<group.getChildCount();i++) {
            var found=nativePanes(group.getChildAt(i));if(found!=null)return found;
        }
        return null;
    }
    private static void check(boolean condition,String message) {if(!condition)throw new AssertionError(message);}
    private static void layout(View view,int width) {
        int pixels=Math.round(width*view.getResources().getDisplayMetrics().density);
        view.measure(View.MeasureSpec.makeMeasureSpec(pixels,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(pixels,View.MeasureSpec.EXACTLY));
        view.layout(0,0,pixels,pixels);
    }
    private static void until(android.app.Instrumentation instrumentation,java.util.function.BooleanSupplier condition) throws Exception {
        long end=android.os.SystemClock.uptimeMillis()+10000;
        while(true) {
            java.util.concurrent.atomic.AtomicBoolean ready=new java.util.concurrent.atomic.AtomicBoolean();
            instrumentation.runOnMainSync(() -> ready.set(condition.getAsBoolean()));
            if(ready.get())return;
            if(android.os.SystemClock.uptimeMillis()>end)throw new AssertionError("Native pane transition did not settle");
            Thread.sleep(20);
        }
    }
    /** Call from the instrumentation thread: animation completion differs from first layout. */
    public static int runWindow(android.app.Instrumentation instrumentation,android.app.Activity activity) throws Exception {
        var dialog=new java.util.concurrent.atomic.AtomicReference<android.app.Dialog>();
        var composition=new java.util.concurrent.atomic.AtomicReference<SystemCollectionDetail>();
        var collection=new java.util.concurrent.atomic.AtomicReference<TextView>();
        instrumentation.runOnMainSync(() -> {
            TextView list=new TextView(activity);list.setText("Notes");collection.set(list);
            SystemCollectionDetail panes=new SystemCollectionDetail(activity,list,new EditText(activity),region -> {});composition.set(panes);
            android.app.Dialog window=new android.app.Dialog(activity);dialog.set(window);window.setContentView(panes);window.show();
            window.getWindow().setLayout(Math.round(400*activity.getResources().getDisplayMetrics().density),-1);
        });
        try {
            until(instrumentation,() -> composition.get().getWidth()>0&&nativePanes(composition.get()).isSlideable());
            instrumentation.runOnMainSync(() -> composition.get().render(SystemCollectionDetail.Region.DETAIL));
            until(instrumentation,() -> nativePanes(composition.get()).isOpen());
            java.util.concurrent.atomic.AtomicBoolean obscured=new java.util.concurrent.atomic.AtomicBoolean();
            instrumentation.runOnMainSync(() -> obscured.set(collection.get().getVisibility()==View.INVISIBLE));
            check(obscured.get(),"Animated detail leaves obscured collection in native traversal");
            return 1;
        } finally {instrumentation.runOnMainSync(() -> {composition.get().close();dialog.get().dismiss();});}
    }
    public static int run(Context context) {
        TextView collection=new TextView(context);collection.setText("Notes");
        EditText detail=new EditText(context);detail.setText("Retained draft");detail.setSelection(2,5);
        ArrayList<SystemCollectionDetail.Region> requests=new ArrayList<>();
        SystemCollectionDetail panes=new SystemCollectionDetail(context,collection,detail,requests::add);
        panes.render(SystemCollectionDetail.Region.DETAIL);layout(panes,400);
        var nativeLayout=java.util.Objects.requireNonNull(nativePanes(panes));
        check(nativeLayout.isSlideable()&&nativeLayout.isOpen(),"Compact detail was not selected from committed state");
        check(collection.getVisibility()==View.INVISIBLE,"Obscured collection remains visible to native traversal");
        check(panes.requestBack(),"Detail Back was not handled");
        check(requests.size()==1&&requests.get(0)==SystemCollectionDetail.Region.COLLECTION,"Back did not propose collection");
        check(nativeLayout.isOpen(),"Back changed panes before application authorization");
        layout(panes,1000);
        check(!nativeLayout.isSlideable(),"Wide allocation did not produce two panes");
        check(collection.getWidth()>0&&detail.getWidth()>0&&nativeLayout.getChildAt(1).getLeft()>=nativeLayout.getChildAt(0).getRight(),"Wide panes overlap");
        layout(panes,400);
        check(nativeLayout.isSlideable()&&nativeLayout.isOpen(),"Returning to compact lost committed detail");
        check("Retained draft".contentEquals(detail.getText())&&detail.getSelectionStart()==2&&detail.getSelectionEnd()==5,"Adaptation replaced input or selection");
        check(requests.size()==1,"Layout changes emitted navigation");
        panes.render(SystemCollectionDetail.Region.COLLECTION);layout(panes,1000);layout(panes,400);
        check(!nativeLayout.isOpen(),"Committed collection did not survive wide-to-compact change");
        check(!panes.requestBack()&&requests.size()==1,"Collection Back was consumed as detail navigation");
        panes.close();panes.close();
        check(!panes.requestBack()&&requests.size()==1,"Closed composition emitted Back");
        boolean refused=false;try{panes.render(SystemCollectionDetail.Region.DETAIL);}catch(IllegalStateException expected){refused=true;}
        check(refused,"Closed composition accepted another render");
        return 4;
    }
}
