package studio.threadlabs.systemui.tests;

import android.app.Dialog;
import android.app.Instrumentation;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;
import androidx.activity.BackEventCompat;
import studio.threadlabs.systemui.SystemCollectionDetail;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** Run on an instrumentation thread with a Material-themed Activity and a real attached window. */
public final class SystemCollectionBackChecks {
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private static void until(Instrumentation test,BooleanSupplier ready)throws Exception {
        long end=android.os.SystemClock.uptimeMillis()+10000;
        while(true){AtomicReference<Boolean> value=new AtomicReference<>();test.runOnMainSync(()->value.set(ready.getAsBoolean()));if(value.get())return;if(android.os.SystemClock.uptimeMillis()>end)throw new AssertionError("Predictive Back did not settle");Thread.sleep(20);}
    }
    public static int runWindow(Instrumentation test,android.app.Activity activity)throws Exception {
        AtomicReference<Dialog> dialog=new AtomicReference<>();AtomicReference<SystemCollectionDetail> view=new AtomicReference<>();
        AtomicReference<View> detailPane=new AtomicReference<>();AtomicReference<EditText> input=new AtomicReference<>();AtomicInteger requests=new AtomicInteger();
        test.runOnMainSync(()->{
            TextView collection=new TextView(activity);collection.setText("Collection preview");collection.setBackgroundColor(android.graphics.Color.rgb(129,33,77));EditText editor=new EditText(activity);input.set(editor);editor.setText("Retained back draft");editor.setSelection(3);
            SystemCollectionDetail composition=new SystemCollectionDetail(activity,collection,editor,region->requests.incrementAndGet());view.set(composition);
            Dialog window=new Dialog(activity);dialog.set(window);window.setContentView(composition);window.show();window.getWindow().setLayout(Math.round(400*activity.getResources().getDisplayMetrics().density),-1);
            composition.render(SystemCollectionDetail.Region.DETAIL);
            android.view.ViewGroup nativeLayout=(android.view.ViewGroup)composition.getChildAt(0);detailPane.set(nativeLayout.getChildAt(1));
        });
        try {
            until(test,()->view.get().getWidth()>0);
            test.runOnMainSync(()->{view.get().startBackProgress(new BackEventCompat(0,100,0,BackEventCompat.EDGE_LEFT));view.get().updateBackProgress(new BackEventCompat(100,100,.4f,BackEventCompat.EDGE_LEFT));});
            until(test,()->detailPane.get().getTranslationX()>0&&detailPane.get().getTranslationX()<detailPane.get().getWidth());
            test.waitForIdleSync();test.getUiAutomation().waitForIdle(100,5000);
            int[] position=new int[2];test.runOnMainSync(()->view.get().getLocationOnScreen(position));
            android.graphics.Bitmap screen=test.getUiAutomation().takeScreenshot();
            check(screen!=null,"Back preview screenshot unavailable");
            try {
                int pixel=screen.getPixel(position[0]+20,position[1]+view.get().getHeight()/2);
                try(var output=new java.io.FileOutputStream(new java.io.File(activity.getFilesDir(),"back-reveal-fixture.png"))){screen.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}
                check(Math.abs(android.graphics.Color.red(pixel)-129)<=2&&Math.abs(android.graphics.Color.green(pixel)-33)<=2&&Math.abs(android.graphics.Color.blue(pixel)-77)<=2,"Native collection is clipped out of the predictive reveal: "+Integer.toHexString(pixel));
            } finally {screen.recycle();}
            check(requests.get()==0,"Gesture progress requested navigation");
            test.runOnMainSync(()->view.get().cancelBackProgress());
            until(test,()->detailPane.get().getTranslationX()==0);
            check(requests.get()==0,"Cancelled gesture requested navigation");
            test.runOnMainSync(()->check("Retained back draft".contentEquals(input.get().getText())&&input.get().getSelectionStart()==3,"Cancellation lost draft/caret"));
            int passed=1;
            test.runOnMainSync(()->{view.get().startBackProgress(new BackEventCompat(0,100,0,BackEventCompat.EDGE_RIGHT));view.get().updateBackProgress(new BackEventCompat(100,100,.5f,BackEventCompat.EDGE_RIGHT));});
            until(test,()->detailPane.get().getTranslationX()<0&&detailPane.get().getTranslationX()>-detailPane.get().getWidth());
            test.runOnMainSync(()->{check(view.get().requestBack(),"Completed Back was not handled");view.get().render(SystemCollectionDetail.Region.DETAIL);});
            until(test,()->detailPane.get().getTranslationX()==0);
            check(requests.get()==1,"Completed gesture did not request exactly one decision");passed++;
            test.runOnMainSync(()->{view.get().startBackProgress(new BackEventCompat(0,100,0,BackEventCompat.EDGE_LEFT));view.get().updateBackProgress(new BackEventCompat(100,100,.6f,BackEventCompat.EDGE_LEFT));});
            until(test,()->detailPane.get().getTranslationX()>0&&detailPane.get().getTranslationX()<detailPane.get().getWidth());
            test.runOnMainSync(()->{check(view.get().requestBack(),"Accepted Back request was lost");view.get().render(SystemCollectionDetail.Region.COLLECTION);});
            until(test,()->detailPane.get().getTranslationX()==0&&!((androidx.slidingpanelayout.widget.SlidingPaneLayout)((android.view.ViewGroup)view.get()).getChildAt(0)).isOpen());
            check(requests.get()==2,"Accepted completion emitted duplicate navigation");passed++;
            test.runOnMainSync(()->view.get().render(SystemCollectionDetail.Region.DETAIL));
            until(test,()->((androidx.slidingpanelayout.widget.SlidingPaneLayout)((android.view.ViewGroup)view.get()).getChildAt(0)).isOpen());
            test.runOnMainSync(()->{view.get().startBackProgress(new BackEventCompat(0,100,0,BackEventCompat.EDGE_LEFT));view.get().updateBackProgress(new BackEventCompat(100,100,.6f,BackEventCompat.EDGE_LEFT));});
            until(test,()->detailPane.get().getTranslationX()>0&&detailPane.get().getTranslationX()<detailPane.get().getWidth());
            test.runOnMainSync(()->{view.get().reducedMotion(true);view.get().updateBackProgress(new BackEventCompat(100,100,.8f,BackEventCompat.EDGE_LEFT));});
            test.waitForIdleSync();test.getUiAutomation().waitForIdle(100,5000);
            test.runOnMainSync(()->check(detailPane.get().getTranslationX()==0&&"Retained back draft".contentEquals(input.get().getText())&&input.get().getSelectionStart()==3,"Reduced motion did not clear preview while retaining input"));
            check(requests.get()==2,"Motion preference requested navigation");passed++;
            test.runOnMainSync(()->{view.get().startBackProgress(new BackEventCompat(0,100,0,BackEventCompat.EDGE_LEFT));view.get().updateBackProgress(new BackEventCompat(100,100,.7f,BackEventCompat.EDGE_LEFT));});
            test.waitForIdleSync();test.getUiAutomation().waitForIdle(100,5000);
            test.runOnMainSync(()->check(detailPane.get().getTranslationX()==0,"Reduced motion allowed a new animated preview"));passed++;
            test.runOnMainSync(()->view.get().reducedMotion(false));
            test.runOnMainSync(()->{view.get().startBackProgress(new BackEventCompat(0,100,0,BackEventCompat.EDGE_LEFT));view.get().updateBackProgress(new BackEventCompat(100,100,.6f,BackEventCompat.EDGE_LEFT));});
            until(test,()->detailPane.get().getTranslationX()>0);
            test.runOnMainSync(()->{view.get().close();view.get().cancelBackProgress();check(!view.get().requestBack(),"Closed composition accepted completion");});
            until(test,()->detailPane.get().getTranslationX()==0);
            check(requests.get()==2,"Teardown emitted a stale request");passed++;
            return passed;
        } finally {test.runOnMainSync(()->{view.get().close();dialog.get().dismiss();});}
    }
}
